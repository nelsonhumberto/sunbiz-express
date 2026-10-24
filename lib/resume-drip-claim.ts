/**
 * Resume-drip send claims.
 *
 * The cron can overlap (four Vercel slots plus GitHub at minute 37).
 * A partial unique index on EmailNotification (filingId, notificationType, step)
 * makes the second insert fail. The winner inserts PENDING, sends, then marks
 * SENT. A loser sees the fresh claim and does not send.
 *
 * FAILED rows stay in that unique slot. A later run reclaims the same row
 * until RESUME_DRIP_MAX_ATTEMPTS. Postgres treats NULL as distinct, so step
 * is always the notification type on these rows.
 */
import { prisma } from './db';

export const RESUME_DRIP_BATCH_SIZE = 50;
export const RESUME_DRIP_MAX_ATTEMPTS = 3;
/** A crashed worker's PENDING row can be taken again after this long. */
export const RESUME_CLAIM_STALE_MS = 15 * 60 * 1000;

const RESUME_TYPES = new Set(['RESUME_1H', 'RESUME_1D', 'RESUME_3D']);

export function isResumeDripType(type: string): boolean {
  return RESUME_TYPES.has(type);
}

export function isResendDevAddress(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@resend.dev');
}

export interface ResumeClaimRow {
  id: string;
  status: string;
  attemptCount: number;
  claimedAt: Date | null;
  createdAt: Date;
}

export type ResumeClaimPlan = 'insert' | 'reclaim' | 'skip';

export function claimIsStale(
  row: Pick<ResumeClaimRow, 'status' | 'claimedAt' | 'createdAt'>,
  nowMs: number,
): boolean {
  if (row.status !== 'PENDING' && row.status !== 'QUEUED') return false;
  const stamp = (row.claimedAt ?? row.createdAt).getTime();
  return nowMs - stamp >= RESUME_CLAIM_STALE_MS;
}

/** True when another worker must not send this step. */
export function resumeSendBlocksAnotherAttempt(
  row: Pick<ResumeClaimRow, 'status' | 'attemptCount' | 'claimedAt' | 'createdAt'>,
  nowMs: number,
): boolean {
  if (row.status === 'SENT' || row.status === 'BOUNCED') return true;
  if (row.attemptCount >= RESUME_DRIP_MAX_ATTEMPTS) return true;
  if (row.status === 'FAILED') return false;
  if (row.status === 'PENDING' || row.status === 'QUEUED') return !claimIsStale(row, nowMs);
  return true;
}

export function planResumeClaim(existing: ResumeClaimRow | null, nowMs: number): ResumeClaimPlan {
  if (!existing) return 'insert';
  if (resumeSendBlocksAnotherAttempt(existing, nowMs)) return 'skip';
  return 'reclaim';
}

/** Only a delivered message counts. FAILED stays retryable. */
export function resumeDeliveryCountsAsSent(status: string): boolean {
  return status === 'SENT';
}

export function isUniqueConflict(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2002',
  );
}

export async function claimResumeSend(args: {
  filingId: string;
  userId: string;
  type: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  nowMs: number;
}): Promise<{ ok: true; id: string } | { ok: false }> {
  const claimedAt = new Date(args.nowMs);
  try {
    const created = await prisma.emailNotification.create({
      data: {
        filingId: args.filingId,
        userId: args.userId,
        notificationType: args.type,
        step: args.type,
        recipientEmail: args.recipientEmail,
        subject: args.subject,
        templateName: args.type.toLowerCase(),
        htmlBody: args.htmlBody,
        status: 'PENDING',
        attemptCount: 1,
        claimedAt,
      },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (err) {
    if (!isUniqueConflict(err)) throw err;
  }

  const existing = await prisma.emailNotification.findFirst({
    where: {
      filingId: args.filingId,
      notificationType: args.type,
      step: args.type,
    },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      claimedAt: true,
      createdAt: true,
    },
  });
  if (!existing || planResumeClaim(existing, args.nowMs) !== 'reclaim') {
    return { ok: false };
  }

  const won = await reclaimResumeSend({
    id: existing.id,
    subject: args.subject,
    htmlBody: args.htmlBody,
    recipientEmail: args.recipientEmail,
    nowMs: args.nowMs,
  });
  return won ? { ok: true, id: existing.id } : { ok: false };
}

async function reclaimResumeSend(args: {
  id: string;
  subject: string;
  htmlBody: string;
  recipientEmail: string;
  nowMs: number;
}): Promise<boolean> {
  const cutoff = new Date(args.nowMs - RESUME_CLAIM_STALE_MS);
  const reclaimed = await prisma.emailNotification.updateMany({
    where: {
      id: args.id,
      attemptCount: { lt: RESUME_DRIP_MAX_ATTEMPTS },
      OR: [
        { status: 'FAILED' },
        {
          AND: [
            { status: { in: ['PENDING', 'QUEUED'] } },
            {
              OR: [
                { claimedAt: { lt: cutoff } },
                { AND: [{ claimedAt: null }, { createdAt: { lt: cutoff } }] },
              ],
            },
          ],
        },
      ],
    },
    data: {
      status: 'PENDING',
      attemptCount: { increment: 1 },
      claimedAt: new Date(args.nowMs),
      errorMessage: null,
      subject: args.subject,
      htmlBody: args.htmlBody,
      recipientEmail: args.recipientEmail,
    },
  });
  return reclaimed.count === 1;
}
