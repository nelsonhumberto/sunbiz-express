/**
 * Abandoned-draft recovery and the resume-order sequence.
 *
 * Skip and stamp predicates stay pure so unit tests can share them.
 * The jobs live here so `app/api/cron/recovery/route.ts` exports only handlers.
 */
import { prisma } from './db';
import { renderTemplate, sendEmail, type NotificationType } from './email';
import { isQaOrE2eRecipient, normalizeEmail } from './email-address';
import { isResumeDripEnabled, resumeEmailReplyTo } from './feature-flags';
import { isSpanishPublicPath } from './locale-paths';
import { captureResumeEmailSent } from './posthog-server';
import {
  claimResumeSend,
  isResendDevAddress,
  RESUME_CLAIM_STALE_MS,
  RESUME_DRIP_BATCH_SIZE,
  RESUME_DRIP_MAX_ATTEMPTS,
  resumeDeliveryCountsAsSent,
  resumeSendBlocksAnotherAttempt,
} from './resume-drip-claim';
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

/** Exact mailboxes the recovery jobs never mail. Compared after trim, lowercasing, and plus-tag removal. */
export const RECOVERY_SKIP_EMAILS = ['nelsonhumberto@gmail.com'] as const;

/**
 * Domains the recovery jobs never mail, including subdomains.
 * admin@ and social@ on launchforma.com are included. A lookalike host
 * such as launchforma.com.evil is not.
 */
export const RECOVERY_SKIP_DOMAINS = [
  'launchforma.com',
  'intelepeer.ai',
  'aqurio.com',
  // Placeholder mailbox on a guest row before the visitor types a real email.
  // The drip reads User.email. This domain keeps that row out of the queue.
  'guest.launchforma.invalid',
] as const;

function mailboxDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return '';
  return email.slice(at + 1);
}

/** Drop a +tag from the local part. nelsonhumberto+x@gmail.com becomes nelsonhumberto@gmail.com. */
export function stripEmailPlusTag(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 1) return normalized;
  const local = normalized.slice(0, at);
  const plus = local.indexOf('+');
  const base = plus === -1 ? local : local.slice(0, plus);
  return `${base}@${normalized.slice(at + 1)}`;
}

function domainIsSkipped(domain: string): boolean {
  return (RECOVERY_SKIP_DOMAINS as readonly string[]).some(
    (root) => domain === root || domain.endsWith(`.${root}`),
  );
}

export function isRecoverySkipAddress(email: string): boolean {
  const normalized = stripEmailPlusTag(email);
  if ((RECOVERY_SKIP_EMAILS as readonly string[]).includes(normalized)) return true;
  return domainIsSkipped(mailboxDomain(normalized));
}

function recoverySkipFilters() {
  const domainFilters = RECOVERY_SKIP_DOMAINS.map((domain) => ({
    NOT: {
      OR: [
        { email: { endsWith: `@${domain}`, mode: 'insensitive' as const } },
        { email: { endsWith: `.${domain}`, mode: 'insensitive' as const } },
      ],
    },
  }));
  const mailboxFilters = RECOVERY_SKIP_EMAILS.map((email) => {
    const at = email.lastIndexOf('@');
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    return {
      NOT: {
        OR: [
          { email: { equals: email, mode: 'insensitive' as const } },
          {
            AND: [
              { email: { startsWith: `${local}+`, mode: 'insensitive' as const } },
              { email: { endsWith: `@${domain}`, mode: 'insensitive' as const } },
            ],
          },
        ],
      },
    };
  });
  return [...domainFilters, ...mailboxFilters];
}

export function shouldSkipDraftRecovery(draft: RecoveryDraft): boolean {
  if (draft.isTest) return true;
  if (draft.adminArchivedAt || draft.userArchivedAt) return true;
  if (draft.user.role === 'ADMIN') return true;
  const email = draft.user.email.trim().toLowerCase();
  // qa+ and e2e+ are prefixes on the original local part, so they are
  // checked before plus-tag removal. The internal mailbox and domain
  // list matches the address after that tag is stripped.
  if (isQaOrE2eRecipient(email)) return true;
  if (isRecoverySkipAddress(email)) return true;
  if (isResendDevAddress(email)) return true;
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
  /** Exclusive. Hours since the draft last changed. */
  maxHours: number;
  /** The last email. The cron stamps Filing.abandonedAt when this one is sent. */
  final: boolean;
}

/**
 * Nothing at or past 96 hours since updatedAt is eligible.
 * RESUME_3D is the only step that can match from 72 hours up to this bound.
 */
export const RESUME_DRIP_MAX_AGE_HOURS = 96;

/**
 * About 1 hour, 1 day, and 3 days after a draft goes idle.
 * RESUME_1H is 1 to 24 hours and RESUME_1D is 24 to 72 hours.
 * RESUME_3D stays open from 72 to 96 hours so the four daily crons can send it.
 * An older backlog matches no step, so it cannot receive the 1 hour email.
 */
export const RESUME_DRIP_STEPS: readonly ResumeDripStep[] = [
  { type: 'RESUME_1H', minHours: 1, maxHours: 24, final: false },
  { type: 'RESUME_1D', minHours: 24, maxHours: 72, final: false },
  { type: 'RESUME_3D', minHours: 72, maxHours: RESUME_DRIP_MAX_AGE_HOURS, final: true },
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

  if (candidate.ageHours >= RESUME_DRIP_MAX_AGE_HOURS) {
    return { send: null, final: false, reason: 'window-closed' };
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

function localeToken(value: string): 'es' | 'en' | null {
  const token = value.trim().toLowerCase();
  if (token === 'en' || token.startsWith('en-') || token.startsWith('en_')) return 'en';
  if (token === 'es' || token.startsWith('es-') || token.startsWith('es_')) return 'es';
  return null;
}

function pathFromCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) return (trimmed.split('?')[0] ?? trimmed).split('#')[0] || '/';
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).pathname || '/';
  } catch {
    return null;
  }
}

/**
 * Filing locale, then the user's locale. A stored en or es wins.
 * When neither is stored, English is the default unless a candidate is a
 * public path under /es (the filing's entry path).
 */
export function resolveDripLocale(
  ...candidates: Array<string | null | undefined>
): 'es' | 'en' {
  let spanishPath = false;
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    const token = localeToken(value);
    if (token) return token;
    const path = pathFromCandidate(value);
    if (path && isSpanishPublicPath(path)) spanishPath = true;
  }
  return spanishPath ? 'es' : 'en';
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
    return { scanned: 0, sent: 0, skipped: 1, failed: 0, disabled: true as const };
  }
  const stats = await runResumeDrip(now);
  return { ...stats, disabled: false as const };
}

/**
 * A row that already owns this step: sent, bounced, out of attempts, or a
 * fresh PENDING/QUEUED claim. FAILED under the attempt cap and a stale claim
 * do not match, so those drafts stay eligible.
 */
function blockingResumeNotification(type: ResumeDripType, nowMs: number) {
  const freshAfter = new Date(nowMs - RESUME_CLAIM_STALE_MS);
  return {
    notificationType: type,
    OR: [
      { status: { in: ['SENT', 'BOUNCED'] as string[] } },
      { attemptCount: { gte: RESUME_DRIP_MAX_ATTEMPTS } },
      {
        AND: [
          { status: { in: ['PENDING', 'QUEUED'] as string[] } },
          { attemptCount: { lt: RESUME_DRIP_MAX_ATTEMPTS } },
          {
            OR: [
              { claimedAt: { gt: freshAfter } },
              { AND: [{ claimedAt: null }, { createdAt: { gt: freshAfter } }] },
            ],
          },
        ],
      },
    ],
  };
}

function resumeStepUpdatedAt(step: ResumeDripStep, now: number) {
  return {
    gt: new Date(now - step.maxHours * 60 * 60 * 1000),
    lte: new Date(now - step.minHours * 60 * 60 * 1000),
  };
}

/**
 * Oldest drafts that still have a step to send. A draft waiting between
 * steps, or stuck on a fresh claim or a maxed failure, is not in this set,
 * so it cannot fill the page ahead of a newer 1h draft.
 * updatedAt is the last-activity clock. Anything 96 hours or older is out.
 * From 72 to 96 hours the only matching step is RESUME_3D.
 * `take` is the page size. The job keeps reading pages until it has attempted
 * RESUME_DRIP_BATCH_SIZE sends or the window is empty.
 */
export function resumeDraftListArgs(now: number) {
  const oldestActivity = new Date(now - RESUME_DRIP_MAX_AGE_HOURS * 60 * 60 * 1000);
  return {
    where: {
      status: 'DRAFT' as const,
      isTest: false,
      adminArchivedAt: null,
      userArchivedAt: null,
      abandonedAt: null,
      updatedAt: { gt: oldestActivity },
      payments: { none: { status: 'SUCCEEDED' as const } },
      user: {
        role: { not: 'ADMIN' as const },
        accountStatus: { not: 'DELETED' as const },
        AND: [
          ...recoverySkipFilters(),
          { NOT: { email: { startsWith: 'qa+', mode: 'insensitive' as const } } },
          { NOT: { email: { startsWith: 'e2e+', mode: 'insensitive' as const } } },
          { NOT: { email: { endsWith: '@resend.dev', mode: 'insensitive' as const } } },
        ],
      },
      OR: RESUME_DRIP_STEPS.map((step) => ({
        updatedAt: resumeStepUpdatedAt(step, now),
        notifications: { none: blockingResumeNotification(step.type, now) },
      })),
    },
    orderBy: { updatedAt: 'asc' as const },
    take: RESUME_DRIP_BATCH_SIZE,
  };
}

async function runResumeDrip(now: number) {
  const stepTypes = RESUME_DRIP_STEPS.map((step) => step.type);
  const listArgs = resumeDraftListArgs(now);
  const include = {
    user: true,
    payments: { where: { status: 'SUCCEEDED' as const }, select: { id: true }, take: 1 },
  };

  let scanned = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let attempted = 0;
  let skip = 0;

  while (attempted < RESUME_DRIP_BATCH_SIZE) {
    const drafts = await prisma.filing.findMany({
      where: listArgs.where,
      orderBy: listArgs.orderBy,
      take: listArgs.take,
      skip,
      include,
    });
    if (drafts.length === 0) break;

    for (const draft of drafts) {
      if (attempted >= RESUME_DRIP_BATCH_SIZE) break;
      scanned++;
      const didAttempt = await attemptResumeDraft(draft, now, stepTypes);
      if (didAttempt === 'sent') {
        attempted++;
        sent++;
      } else if (didAttempt === 'attempted') {
        attempted++;
        failed++;
      } else {
        skipped++;
      }
    }

    if (drafts.length < listArgs.take || attempted >= RESUME_DRIP_BATCH_SIZE) break;
    skip += drafts.length;
  }

  return { scanned, sent, skipped, failed };
}

async function attemptResumeDraft(
  draft: {
    id: string;
    userId: string;
    status: string;
    updatedAt: Date;
    currentStep: number;
    businessName: string | null;
    locale: string | null;
    entryPath: string | null;
    payments: { id: string }[];
    isTest: boolean;
    adminArchivedAt: Date | null;
    userArchivedAt: Date | null;
    user: {
      email: string;
      firstName: string | null;
      role: string;
      accountStatus: string;
      guestToken: string | null;
      locale: string | null;
    };
  },
  now: number,
  stepTypes: ResumeDripType[],
): Promise<'sent' | 'attempted' | 'skipped'> {
    try {
      const prior = await prisma.emailNotification.findMany({
        where: { filingId: draft.id, notificationType: { in: stepTypes } },
        select: {
          notificationType: true,
          status: true,
          attemptCount: true,
          claimedAt: true,
          createdAt: true,
        },
      });
      const optedOut = await prisma.marketingOptOut.findUnique({
        where: { email: normalizeEmail(draft.user.email) },
        select: { id: true },
      });
      const decision = planResumeDrip({
        enabled: true,
        ageHours: ageHoursSince(draft.updatedAt, now),
        sentTypes: prior
          .filter((row) => resumeSendBlocksAnotherAttempt(row, now))
          .map((row) => row.notificationType),
        status: draft.status,
        paid: draft.payments.length > 0,
        unsubscribed: Boolean(optedOut),
        deleted: draft.user.accountStatus === 'DELETED',
        skip: shouldSkipDraftRecovery(draft),
      });
      if (!decision.send) return 'skipped';

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
      const locale = resolveDripLocale(draft.locale, draft.user.locale, draft.entryPath);
      const context = {
        firstName: draft.user.firstName ?? undefined,
        businessName: draft.businessName ?? undefined,
        resumeUrl,
        unsubscribeUrl,
        locale,
      };
      const rendered = renderTemplate(decision.send, context);
      const claim = await claimResumeSend({
        filingId: draft.id,
        userId: draft.userId,
        type: decision.send,
        recipientEmail: draft.user.email,
        subject: rendered.subject,
        htmlBody: rendered.html,
        nowMs: now,
      });
      if (!claim.ok) return 'skipped';

      const delivery = await sendEmail({
        type: decision.send,
        to: draft.user.email,
        filingId: draft.id,
        userId: draft.userId,
        replyTo: resumeEmailReplyTo(),
        listUnsubscribeUrl: unsubscribeUrl,
        notificationId: claim.id,
        context,
      });

      if (!resumeDeliveryCountsAsSent(delivery.status)) return 'attempted';

      await captureResumeEmailSent({
        step: decision.send,
        filingId: draft.id,
        locale,
        user: { role: draft.user.role, email: draft.user.email },
      });
      if (decision.final && draft.status === 'DRAFT') {
        await prisma.filing.updateMany({
          where: { id: draft.id, status: 'DRAFT', abandonedAt: null },
          data: { abandonedAt: new Date(now) },
        });
      }
      return 'sent';
    } catch (err) {
      console.error('[recovery] resume drip failed', draft.id, err);
      return 'skipped';
    }
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
