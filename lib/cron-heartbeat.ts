/**
 * Best-effort heartbeat for /api/cron/recovery.
 * A failed insert is logged and swallowed so the cron response is unchanged.
 */
import { prisma } from './db';

export const RECOVERY_CRON_JOB = 'recovery';

export interface CronJobCounts {
  scanned: number;
  sent: number;
  skipped?: number;
  failed?: number;
  disabled?: boolean;
}

export interface CronRunWrite {
  job: string;
  startedAt: Date;
  finishedAt: Date;
  eligibleCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  error: string | null;
}

const SECRET_ENV_KEYS = [
  'CRON_SECRET',
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXTAUTH_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'EIN_ENCRYPTION_KEY',
] as const;

/** Error text safe to store. Secret values and connection strings are removed. */
export function sanitizeCronError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'cron failed';
  let message = raw.trim() || 'cron failed';
  message = message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://[redacted]');
  message = message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= 6 && message.includes(value)) {
      message = message.split(value).join('[redacted]');
    }
  }
  return message.slice(0, 500);
}

function skippedCount(job: CronJobCounts, disabledFloor: boolean): number {
  const failed = job.failed ?? 0;
  const fromCounts = job.skipped ?? Math.max(0, job.scanned - job.sent - failed);
  if (disabledFloor) return Math.max(fromCounts, 1);
  return fromCounts;
}

export function buildRecoveryCronRun(input: {
  startedAt: Date;
  finishedAt: Date;
  drafts: CronJobCounts;
  ra: CronJobCounts;
}): CronRunWrite {
  const disabled = input.drafts.disabled === true;
  return {
    job: RECOVERY_CRON_JOB,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    eligibleCount: input.drafts.scanned + input.ra.scanned,
    sentCount: input.drafts.sent + input.ra.sent,
    skippedCount: skippedCount(input.drafts, disabled) + skippedCount(input.ra, false),
    failedCount: (input.drafts.failed ?? 0) + (input.ra.failed ?? 0),
    error: disabled ? 'disabled' : null,
  };
}

export function buildRecoveryCronFailure(input: {
  startedAt: Date;
  finishedAt: Date;
  drafts?: CronJobCounts;
  ra?: CronJobCounts;
  error: unknown;
}): CronRunWrite {
  const drafts = input.drafts ?? { scanned: 0, sent: 0 };
  const ra = input.ra ?? { scanned: 0, sent: 0 };
  const base = buildRecoveryCronRun({
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    drafts,
    ra,
  });
  return {
    ...base,
    failedCount: base.failedCount + 1,
    error: sanitizeCronError(input.error),
  };
}

export async function writeCronRun(row: CronRunWrite): Promise<void> {
  try {
    await prisma.cronRun.create({
      data: {
        job: row.job,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        eligibleCount: row.eligibleCount,
        sentCount: row.sentCount,
        skippedCount: row.skippedCount,
        failedCount: row.failedCount,
        error: row.error,
      },
    });
  } catch (error) {
    console.error('[recovery] cron heartbeat failed', sanitizeCronError(error));
  }
}
