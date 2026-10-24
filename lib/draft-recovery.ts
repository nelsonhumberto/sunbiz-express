/**
 * Drafts the recovery cron must not email, plus the resume-order schedule.
 * Pure so the route and tests share one definition.
 */
export interface RecoveryDraft {
  isTest: boolean;
  adminArchivedAt: Date | null;
  userArchivedAt: Date | null;
  user: { role: string; email: string };
}

/** QA and end-to-end mailboxes (qa+ and e2e+ prefixes) are never part of the sequence. */
export function isQaOrE2eRecipient(email: string): boolean {
  const local = email.trim().toLowerCase().split('@')[0] ?? '';
  return local.startsWith('qa+') || local.startsWith('e2e+');
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

export type ResumeDripType = 'RESUME_1H' | 'RESUME_1D' | 'RESUME_3D';

export interface ResumeDripStep {
  type: ResumeDripType;
  /** Inclusive, hours since the draft last changed. */
  minHours: number;
  /** Exclusive. */
  maxHours: number;
  /** The last email. The cron stamps Filing.abandonedAt when this one goes out. */
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
