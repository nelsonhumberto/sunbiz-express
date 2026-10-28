import { NextResponse } from 'next/server';
import {
  buildRecoveryCronFailure,
  buildRecoveryCronRun,
  sanitizeCronError,
  writeCronRun,
} from '@/lib/cron-heartbeat';
import { runRaRenewalReminders, runScheduledDraftRecovery } from '@/lib/draft-recovery';
import { runPaidFilingOverdueAlerts } from '@/lib/paid-order-alert';
import { isPostFormationSeriesEnabled, isWeeklyNewsletterEnabled } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';

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
// When POST_FORMATION_SERIES_ENABLED is on, the same runs send the day 3,
// day 14, and day 30 notes. When WEEKLY_NEWSLETTER_ENABLED is on, the
// 13:00 UTC run (morning Eastern) sends the next due weekly issue,
// 001 through 004. Both flags
// default off. The other three daily runs are outside the morning window,
// so the newsletter job records a skip and does not send.
// Their sent, skipped, and failed counts are added to the CronRun row.
// A thrown error from either job is stored on that row as well. The route
// still returns 200 so a series failure does not replay the draft mail.
//
// Annual report reminders are handled separately.
// Paid filings with no state filing number also get one admin email once
// payment is 20 hours old. That mail dedupes on the existing
// EmailNotification row for the filing. It does not add a column.

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Fail closed in production: a missing CRON_SECRET must NOT mean "open".
  // (This route sends customer emails, so an open endpoint = email bombing.)
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[recovery] unauthorized');
      return NextResponse.json({ error: 'cron secret not configured' }, { status: 401 });
    }
    // Local development without a secret: allow.
  } else {
    // Require the secret in the Authorization header (avoid query-string secrets
    // that leak into access logs and browser history).
    const headerSecret =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (headerSecret !== CRON_SECRET) {
      console.warn('[recovery] unauthorized');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  console.info('[recovery] start');
  const startedAt = new Date();
  const now = startedAt.getTime();
  let draftStats: Awaited<ReturnType<typeof runScheduledDraftRecovery>> | undefined;
  let raStats: Awaited<ReturnType<typeof runRaRenewalReminders>> | undefined;
  let postFormation: { disabled?: boolean; scanned?: number; sent?: number; skipped?: number; failed?: number } = {
    disabled: true,
  };
  let newsletter: { disabled?: boolean; scanned?: number; sent?: number; skipped?: number; failed?: number } = {
    disabled: true,
  };
  const seriesErrors: string[] = [];
  try {
    draftStats = await runScheduledDraftRecovery(now);
    raStats = await runRaRenewalReminders(now);
    // One admin email once a paid filing is 20 hours old and still has no
    // state filing number. Deduped on the existing EmailNotification row.
    const overdueFilings = await runPaidFilingOverdueAlerts(now);
    if (isPostFormationSeriesEnabled()) {
      try {
        const { runPostFormationSeries } = await import('@/lib/post-formation-job');
        postFormation = await runPostFormationSeries(now);
      } catch (error) {
        const message = sanitizeCronError(error);
        seriesErrors.push(message);
        logger.error('post-formation series failed', { area: 'cron', tag: 'post-formation' }, error);
        postFormation = { disabled: false, scanned: 0, sent: 0, skipped: 0, failed: 1 };
      }
    }
    if (isWeeklyNewsletterEnabled()) {
      try {
        const { runWeeklyNewsletter } = await import('@/lib/newsletter-job');
        newsletter = await runWeeklyNewsletter(now);
      } catch (error) {
        const message = sanitizeCronError(error);
        seriesErrors.push(message);
        logger.error('weekly newsletter failed', { area: 'cron', tag: 'newsletter' }, error);
        newsletter = { disabled: false, scanned: 0, sent: 0, skipped: 0, failed: 1 };
      }
    }
    const seriesError = seriesErrors.length > 0 ? seriesErrors.join('; ') : null;
    const row = buildRecoveryCronRun({
      startedAt,
      finishedAt: new Date(),
      drafts: draftStats,
      ra: raStats,
      postFormation,
      newsletter,
      error: seriesError,
    });
    await writeCronRun(row);
    const counts = {
      eligible: row.eligibleCount,
      sent: row.sentCount,
      skipped: row.skippedCount,
      failed: row.failedCount,
    };
    console.info('[recovery] done', { ...counts });
    return NextResponse.json({
      ok: true,
      drafts: draftStats,
      raRenewals: raStats,
      overdueFilings,
      postFormation,
      newsletter,
      ...(seriesError ? { seriesErrors } : {}),
    });
  } catch (error) {
    await writeCronRun(
      buildRecoveryCronFailure({
        startedAt,
        finishedAt: new Date(),
        drafts: draftStats,
        ra: raStats,
        postFormation,
        newsletter,
        seriesError: seriesErrors.join('; '),
        error,
      }),
    );
    throw error;
  }
}
