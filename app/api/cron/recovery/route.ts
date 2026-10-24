import { NextResponse } from 'next/server';
import { runRaRenewalReminders, runScheduledDraftRecovery } from '@/lib/draft-recovery';

// Recovery + retention scheduler.
//
// Vercel Hobby only allows a daily cron, so vercel.json stays at 14:00 UTC.
// GitHub Actions calls this route every hour. Both callers are safe together:
// EmailNotification is the record of which (filing, type) already went out,
// so a later hour does not send that step or that renewal reminder again.
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
//      day wide and EmailNotification dedupes the type, so the hourly cron
//      still sends each reminder once.
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

  const now = Date.now();
  const draftStats = await runScheduledDraftRecovery(now);
  const raStats = await runRaRenewalReminders(now);

  return NextResponse.json({ ok: true, drafts: draftStats, raRenewals: raStats });
}
