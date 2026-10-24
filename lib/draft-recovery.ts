/**
 * Abandoned-draft recovery and the resume-order sequence.
 *
 * Skip and stamp predicates stay pure so unit tests can share them.
 * The jobs live here so `app/api/cron/recovery/route.ts` exports only handlers.
 */
import { prisma } from './db';
import { sendEmail, type NotificationType } from './email';
import { isQaOrE2eRecipient, normalizeEmail } from './email-address';
import { isResumeDripEnabled, resumeEmailReplyTo } from './feature-flags';
import { captureResumeEmailSent } from './posthog-server';
import { withResumeUtms } from './resume-utm';
import { unsubscribeLink } from './unsubscribe';

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
  if (isQaOrE2eRecipient(email)) return true;
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

export type ResumeDripType = 'RESUME_1H' | 'RESUME_1D' | 'RESUME_3D';

export interface ResumeDripStep {
  type: ResumeDripType;
  /** Inclusive, hours since the draft last changed. */
  minHours: number;
  /** Exclusive. */
  maxHours: number;
  /** The last email. The cron stamps Filing.abandonedAt when this one is sent. */
  final: boolean;
}

/**
 * About 1 hour, 1 day, and 3 days after a draft goes idle.
 * Hourly cron: each step stays open until the next one starts, and the
 * last step stays open for 24 hours so a single missed run still sends it.
 */
export const RESUME_DRIP_STEPS: readonly ResumeDripStep[] = [
  { type: 'RESUME_1H', minHours: 1, maxHours: 24, final: false },
  { type: 'RESUME_1D', minHours: 24, maxHours: 72, final: false },
  { type: 'RESUME_3D', minHours: 72, maxHours: 96, final: true },
];

export type ResumeDripReason =
  | 'disabled'
  | 'skip'
  | 'stopped'
  | 'too-soon'
  | 'window-closed'
  | 'already-sent'
  | 'send';

export interface ResumeDripCandidate {
  enabled: boolean;
  ageHours: number;
  sentTypes: readonly string[];
  status: string;
  /** A succeeded payment means the order is complete even if status is still DRAFT. */
  paid: boolean;
  unsubscribed: boolean;
  deleted: boolean;
  skip: boolean;
}

export interface ResumeDripDecision {
  send: ResumeDripType | null;
  final: boolean;
  reason: ResumeDripReason;
}

const STOPPED: ResumeDripDecision = { send: null, final: false, reason: 'stopped' };

/** Which resume email, if any, should go out for this draft right now. */
export function planResumeDrip(candidate: ResumeDripCandidate): ResumeDripDecision {
  if (!candidate.enabled) return { send: null, final: false, reason: 'disabled' };
  if (candidate.skip) return { send: null, final: false, reason: 'skip' };
  if (
    candidate.deleted ||
    candidate.unsubscribed ||
    candidate.paid ||
    candidate.status !== 'DRAFT'
  ) {
    return STOPPED;
  }

  const step = RESUME_DRIP_STEPS.find(
    (item) => candidate.ageHours >= item.minHours && candidate.ageHours < item.maxHours,
  );
  if (!step) {
    const first = RESUME_DRIP_STEPS[0];
    if (first && candidate.ageHours < first.minHours) {
      return { send: null, final: false, reason: 'too-soon' };
    }
    return { send: null, final: false, reason: 'window-closed' };
  }
  if (candidate.sentTypes.includes(step.type)) {
    return { send: null, final: false, reason: 'already-sent' };
  }
  return { send: step.type, final: step.final, reason: 'send' };
}

export function ageHoursSince(updatedAt: Date, nowMs: number): number {
  return (nowMs - updatedAt.getTime()) / (60 * 60 * 1000);
}

/**
 * Filing locale, then the user's locale, then Spanish.
 * Unknown values are ignored so a bad string still falls through to es.
 */
export function resolveDripLocale(
  ...candidates: Array<string | null | undefined>
): 'es' | 'en' {
  for (const candidate of candidates) {
    const value = candidate?.trim().toLowerCase();
    if (!value) continue;
    if (value === 'en' || value.startsWith('en-') || value.startsWith('en_')) return 'en';
    if (value === 'es' || value.startsWith('es-') || value.startsWith('es_')) return 'es';
  }
  return 'es';
}

export function wizardPathForDraft(
  filingId: string,
  currentStep: number | null | undefined,
): string {
  const step = currentStep && currentStep >= 1 ? currentStep : 2;
  return `/wizard/${filingId}/${step}`;
}

export type ResumeLinkKind = 'guest' | 'login-link' | 'sign-in';

/** Which existing resume mechanism to use for this account. */
export function resumeLinkPlan(user: {
  accountStatus: string;
  role: string;
  guestToken: string | null;
}): ResumeLinkKind {
  if (user.accountStatus === 'GUEST' && user.guestToken) return 'guest';
  if (user.accountStatus === 'ACTIVE' && user.role !== 'ADMIN') return 'login-link';
  return 'sign-in';
}

export function guestResumeUrl(siteUrl: string, filingId: string, guestToken: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return `${base}/resume?f=${filingId}&t=${guestToken}`;
}

export function signInResumeUrl(siteUrl: string, wizardPath: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return `${base}/sign-in?next=${encodeURIComponent(wizardPath)}`;
}

/**
 * Cron entry for abandoned drafts.
 * The resume sequence replaces the 24h / 72h / 7d mail while the flag is on.
 * While it is off, this sends nothing. `runDraftRecovery` still stamps
 * abandonedAt after a successful 7-day send when that job is invoked.
 */
export async function runScheduledDraftRecovery(now: number) {
  if (!isResumeDripEnabled()) {
    return { scanned: 0, sent: 0, disabled: true as const };
  }
  const stats = await runResumeDrip(now);
  return { ...stats, disabled: false as const };
}

async function runResumeDrip(now: number) {
  const oldestHours = RESUME_DRIP_STEPS[RESUME_DRIP_STEPS.length - 1]!.maxHours;
  const newestHours = RESUME_DRIP_STEPS[0]!.minHours;
  const oldestCutoff = new Date(now - oldestHours * 60 * 60 * 1000);
  const newestCutoff = new Date(now - newestHours * 60 * 60 * 1000);
  const stepTypes = RESUME_DRIP_STEPS.map((step) => step.type);

  const drafts = await prisma.filing.findMany({
    where: {
      status: 'DRAFT',
      isTest: false,
      adminArchivedAt: null,
      userArchivedAt: null,
      updatedAt: { gte: oldestCutoff, lte: newestCutoff },
      payments: { none: { status: 'SUCCEEDED' } },
      user: {
        role: { not: 'ADMIN' },
        accountStatus: { not: 'DELETED' },
        AND: [
          { NOT: { email: { endsWith: '@launchforma.com', mode: 'insensitive' } } },
          { NOT: { email: { startsWith: 'qa+', mode: 'insensitive' } } },
          { NOT: { email: { startsWith: 'e2e+', mode: 'insensitive' } } },
        ],
      },
    },
    include: {
      user: true,
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
    },
  });

  let sent = 0;
  for (const draft of drafts) {
    try {
      const prior = await prisma.emailNotification.findMany({
        where: { filingId: draft.id, notificationType: { in: stepTypes } },
        select: { notificationType: true },
      });
      const optedOut = await prisma.marketingOptOut.findUnique({
        where: { email: normalizeEmail(draft.user.email) },
        select: { id: true },
      });
      const decision = planResumeDrip({
        enabled: true,
        ageHours: ageHoursSince(draft.updatedAt, now),
        sentTypes: prior.map((row) => row.notificationType),
        status: draft.status,
        paid: draft.payments.length > 0,
        unsubscribed: Boolean(optedOut),
        deleted: draft.user.accountStatus === 'DELETED',
        skip: shouldSkipDraftRecovery(draft),
      });
      if (!decision.send) continue;

      const wizardPath = wizardPathForDraft(draft.id, draft.currentStep);
      const linkKind = resumeLinkPlan(draft.user);
      const rawResumeUrl =
        linkKind === 'guest' && draft.user.guestToken
          ? guestResumeUrl(SITE_URL, draft.id, draft.user.guestToken)
          : linkKind === 'login-link'
            ? await createLoginLink(draft.userId, wizardPath)
            : signInResumeUrl(SITE_URL, wizardPath);
      const resumeUrl = withResumeUtms(rawResumeUrl, decision.send);
      const unsubscribeUrl = withResumeUtms(
        unsubscribeLink(SITE_URL, draft.user.email),
        decision.send,
      );
      const locale = resolveDripLocale(draft.locale, draft.user.locale);

      const delivery = await sendEmail({
        type: decision.send,
        to: draft.user.email,
        filingId: draft.id,
        userId: draft.userId,
        replyTo: resumeEmailReplyTo(),
        listUnsubscribeUrl: unsubscribeUrl,
        context: {
          firstName: draft.user.firstName,
          businessName: draft.businessName ?? undefined,
          resumeUrl,
          unsubscribeUrl,
          locale,
        },
      });

      if (delivery.status === 'SENT') {
        await captureResumeEmailSent({
          step: decision.send,
          filingId: draft.id,
          locale,
        });
        if (decision.final && draft.status === 'DRAFT') {
          await prisma.filing.updateMany({
            where: { id: draft.id, status: 'DRAFT', abandonedAt: null },
            data: { abandonedAt: new Date(now) },
          });
        }
      }
      sent++;
    } catch (err) {
      console.error('[recovery] resume drip failed', draft.id, err);
    }
  }

  return { scanned: drafts.length, sent };
}

async function createLoginLink(userId: string, wizardPath: string): Promise<string> {
  const loginLink = await import('./login-link');
  return loginLink.createLoginLink(userId, wizardPath);
}

export type RaRenewalType = 'RA_RENEWAL_60' | 'RA_RENEWAL_30' | 'RA_RENEWAL_7';

/** One calendar day wide, so an hourly cron still maps a whole day to one type. */
export const RA_RENEWAL_WINDOWS: readonly {
  type: RaRenewalType;
  minDays: number;
  maxDays: number;
}[] = [
  { type: 'RA_RENEWAL_60', minDays: 60, maxDays: 61 },
  { type: 'RA_RENEWAL_30', minDays: 30, maxDays: 31 },
  { type: 'RA_RENEWAL_7', minDays: 7, maxDays: 8 },
];

export function wholeDaysUntil(targetMs: number, nowMs: number): number {
  return Math.floor((targetMs - nowMs) / (24 * 60 * 60 * 1000));
}

export function raRenewalTypeForDays(days: number): RaRenewalType | null {
  const bucket = RA_RENEWAL_WINDOWS.find((item) => days >= item.minDays && days < item.maxDays);
  return bucket?.type ?? null;
}

export async function runRaRenewalReminders(now: number) {
  const horizon = new Date(now + 62 * 24 * 60 * 60 * 1000);

  const services = await prisma.registeredAgentService.findMany({
    where: {
      status: 'ACTIVE',
      renewalDate: { gte: new Date(now), lte: horizon },
      serviceProvider: 'INTERNAL',
    },
    include: {
      filing: {
        include: {
          user: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: { cardLast4: true },
          },
        },
      },
    },
  });

  let sent = 0;
  for (const svc of services) {
    const days = wholeDaysUntil(svc.renewalDate.getTime(), now);
    const bucket = raRenewalTypeForDays(days);
    if (!bucket) continue;

    const alreadySent = await prisma.emailNotification.findFirst({
      where: { filingId: svc.filingId, notificationType: bucket },
      select: { id: true },
    });
    if (alreadySent) continue;

    await sendEmail({
      type: bucket,
      to: svc.filing.user.email,
      filingId: svc.filingId,
      userId: svc.filing.userId,
      context: {
        firstName: svc.filing.user.firstName,
        businessName: svc.filing.businessName ?? undefined,
        raAutoRenew: svc.autoRenew,
        raRenewalPriceCents: svc.renewalPriceCents,
        raRenewalDate: svc.renewalDate,
        raCardLast4: svc.filing.payments[0]?.cardLast4 ?? undefined,
        raRenewUrl: `${SITE_URL}/dashboard/filings/${svc.filingId}/registered-agent`,
      },
    });
    sent++;
  }

  return { scanned: services.length, sent };
}
