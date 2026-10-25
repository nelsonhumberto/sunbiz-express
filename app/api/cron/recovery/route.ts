import { NextResponse } from 'next/server';
import { buildRecoveryCronFailure, buildRecoveryCronRun, writeCronRun } from '@/lib/cron-heartbeat';
import { runRaRenewalReminders, runScheduledDraftRecovery } from '@/lib/draft-recovery';

// Recovery + retention scheduler.
//
// Hobby allows many cron jobs, each at most once per day, and the same path
// may be scheduled more than once. vercel.json lists this route four times:
// 9am, 1pm, 6pm, and 10pm Eastern Daylight Time (13:00, 17:00, 22:00, and
// 02:00 UTC). The query string is not read, so a slot parameter would not
// change what is sent. Those four Vercel crons are the only schedule.
// A resume step is claimed (PENDING) before it is sent. A partial unique
// index on EmailNotification (filingId, notificationType, step) stops two
// runs from both sending. Registered-agent reminders still skip when any
// EmailNotification row for that type already exists.
//
// What it sends (the jobs live in lib/draft-recovery.ts):
//
//   1. Resume-order sequence (RESUME_DRIP_ENABLED, default off). About 1 hour,
//      1 day, and 3 days after Filing.updatedAt on a DRAFT that is still
//      unpaid. Replaces the old ABANDONED_24H / ABANDONED_72H / ABANDONED_7D
//      cron. When the flag is off, none of those abandoned-draft emails send.
//      runDraftRecovery still stamps abandonedAt only after a successful 7-day
//      send. The last resume step stamps the same way when that email is sent.
//   2. Registered-agent renewal at 60 / 30 / 7 days. The window is one calendar
//      day wide and EmailNotification dedupes the type, so a later run the
//      same day still sends each reminder once.
//
// Each invocation writes one CronRun heartbeat after the jobs finish, including
// a skipped row with error "disabled" when RESUME_DRIP_ENABLED is off. A thrown
// job stores the error text with secrets removed. The insert is swallowed if
// it fails, so the heartbeat cannot change the cron result.
//
// Annual report reminders are handled separately.

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Fail closed in production: a missing CRON_SECRET must NOT mean "open".
  // (This route sends customer emails, so an open endpoint = email bombing.)
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'cron secret not configured' }, { status: 401 });
    }
    // Local development without a secret: allow.
  } else {
    // Require the secret in the Authorization header (avoid query-string secrets
    // that leak into access logs and browser history).
    const headerSecret =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (headerSecret !== CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const startedAt = new Date();
  const now = startedAt.getTime();
  let draftStats: Awaited<ReturnType<typeof runScheduledDraftRecovery>> | undefined;
  let raStats: Awaited<ReturnType<typeof runRaRenewalReminders>> | undefined;
  try {
    draftStats = await runScheduledDraftRecovery(now);
    raStats = await runRaRenewalReminders(now);
    await writeCronRun(
      buildRecoveryCronRun({
        startedAt,
        finishedAt: new Date(),
        drafts: draftStats,
        ra: raStats,
      }),
    );
    return NextResponse.json({ ok: true, drafts: draftStats, raRenewals: raStats });
  } catch (error) {
    await writeCronRun(
      buildRecoveryCronFailure({
        startedAt,
        finishedAt: new Date(),
        drafts: draftStats,
        ra: raStats,
        error,
      }),
    );
    throw error;
  }
}
