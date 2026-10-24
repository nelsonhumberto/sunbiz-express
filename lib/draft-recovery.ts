/**
 * Abandoned-draft recovery for the daily cron.
 *
 * The skip and stamp predicates stay pure so unit tests can share them.
 * `runDraftRecovery` is the job the cron route calls. It lives here so
 * `app/api/cron/recovery/route.ts` exports only the route handler.
 */
import { prisma } from './db';
import { sendEmail, type NotificationType } from './email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

const DRAFT_BUCKETS: Array<{
  type: NotificationType;
  minHours: number;
  maxHours: number;
}> = [
  { type: 'ABANDONED_24H', minHours: 24, maxHours: 48 },
  { type: 'ABANDONED_72H', minHours: 72, maxHours: 96 },
  { type: 'ABANDONED_7D', minHours: 24 * 7, maxHours: 24 * 8 },
];

export interface RecoveryDraft {
  isTest: boolean;
  adminArchivedAt: Date | null;
  userArchivedAt: Date | null;
  user: { role: string; email: string };
}

export function shouldSkipDraftRecovery(draft: RecoveryDraft): boolean {
  if (draft.isTest) return true;
  if (draft.adminArchivedAt || draft.userArchivedAt) return true;
  if (draft.user.role === 'ADMIN') return true;
  const email = draft.user.email.trim().toLowerCase();
  if (email.endsWith('@launchforma.com')) return true;
  return false;
}

/** The 7-day abandoned-draft email is sent once. abandonedAt is that stamp. */
export function shouldSkipSevenDayAbandoned(draft: { abandonedAt: Date | null }): boolean {
  return draft.abandonedAt != null;
}

/** Stamp abandonedAt only after a successful 7-day send for a DRAFT filing. */
export function shouldStampAbandonedAt(input: {
  status: string;
  notificationType: string;
  deliveryStatus: string;
}): boolean {
  return (
    input.notificationType === 'ABANDONED_7D' &&
    input.status === 'DRAFT' &&
    input.deliveryStatus === 'SENT'
  );
}

export async function runDraftRecovery(now: number) {
  const oldestCutoff = new Date(now - 24 * 8 * 60 * 60 * 1000);
  const newestCutoff = new Date(now - 24 * 60 * 60 * 1000);

  const drafts = await prisma.filing.findMany({
    where: {
      status: 'DRAFT',
      isTest: false,
      adminArchivedAt: null,
      userArchivedAt: null,
      updatedAt: { gte: oldestCutoff, lte: newestCutoff },
      user: {
        role: { not: 'ADMIN' },
        NOT: {
          email: { endsWith: '@launchforma.com', mode: 'insensitive' },
        },
      },
    },
    include: { user: true },
  });

  let sent = 0;
  for (const draft of drafts) {
    // Belt and suspenders: never mail admins, @launchforma.com, or test/archived drafts.
    if (shouldSkipDraftRecovery(draft)) continue;
    const ageHours = (now - draft.updatedAt.getTime()) / (60 * 60 * 1000);
    const bucket = DRAFT_BUCKETS.find(
      (b) => ageHours >= b.minHours && ageHours < b.maxHours,
    );
    if (!bucket) continue;

    // A DRAFT that already has abandonedAt has received the 7-day mail.
    if (bucket.type === 'ABANDONED_7D' && shouldSkipSevenDayAbandoned(draft)) continue;

    const alreadySent = await prisma.emailNotification.findFirst({
      where: { filingId: draft.id, notificationType: bucket.type },
      select: { id: true },
    });
    if (alreadySent) continue;

    // Build a CTA that actually works for the recipient. Guests have no
    // password/dashboard, so we hand them a tokenized /resume link that
    // re-authorizes them straight back into the wizard. Account holders go to
    // their dashboard (they can sign in).
    const resumeUrl =
      draft.user.accountStatus === 'GUEST' && draft.user.guestToken
        ? `${SITE_URL}/resume?f=${draft.id}&t=${draft.user.guestToken}`
        : `${SITE_URL}/dashboard`;

    const delivery = await sendEmail({
      type: bucket.type,
      to: draft.user.email,
      filingId: draft.id,
      userId: draft.userId,
      context: {
        firstName: draft.user.firstName,
        businessName: draft.businessName ?? undefined,
        resumeUrl,
      },
    });
    if (
      shouldStampAbandonedAt({
        status: draft.status,
        notificationType: bucket.type,
        deliveryStatus: delivery.status,
      })
    ) {
      await prisma.filing.updateMany({
        where: { id: draft.id, status: 'DRAFT', abandonedAt: null },
        data: { abandonedAt: new Date(now) },
      });
    }
    sent++;
  }

  return { scanned: drafts.length, sent };
}
