import { isPlaceholderGuestEmail } from '@/lib/guest-identity';
import { isChecklistTestAddress } from '@/lib/checklist-opt-in';
import { normalizeEmail } from '@/lib/email-address';

export const POST_FORMATION_STEPS = ['DAY_3', 'DAY_14', 'DAY_30'] as const;
export type PostFormationStepId = (typeof POST_FORMATION_STEPS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Send once the offset is reached, and give a missed cron a week to catch up. */
export const POST_FORMATION_CATCHUP_MS = 7 * DAY_MS;

export const POST_FORMATION_OFFSET_MS: Record<PostFormationStepId, number> = {
  DAY_3: 3 * DAY_MS,
  DAY_14: 14 * DAY_MS,
  DAY_30: 30 * DAY_MS,
};

export type PostFormationSkipReason =
  | 'not-approved'
  | 'no-approval-time'
  | 'filing-test'
  | 'unpaid'
  | 'guest'
  | 'test-address'
  | 'unsubscribed'
  | 'nothing-due';

export interface PostFormationCandidate {
  status: string;
  isTest: boolean;
  sunbizApprovedAt: Date | null;
  accountStatus: string;
  email: string;
  payments: ReadonlyArray<{ status: string; isTest: boolean }>;
  unsubscribed: boolean;
  sentSteps: readonly string[];
}

export function hasRealSucceededPayment(
  payments: ReadonlyArray<{ status: string; isTest: boolean }>,
): boolean {
  return payments.some((payment) => payment.status === 'SUCCEEDED' && payment.isTest === false);
}

/** qa+, e2e+, @launchforma.com, and the guest placeholder domain. */
export function isPostFormationExcludedEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (isChecklistTestAddress(normalized)) return true;
  return isPlaceholderGuestEmail(normalized);
}

export function duePostFormationSteps(
  approvedAt: Date,
  now: Date,
  sentSteps: readonly string[],
): PostFormationStepId[] {
  const age = now.getTime() - approvedAt.getTime();
  const sent = new Set(sentSteps);
  return POST_FORMATION_STEPS.filter((step) => {
    if (sent.has(step)) return false;
    const offset = POST_FORMATION_OFFSET_MS[step];
    return age >= offset && age < offset + POST_FORMATION_CATCHUP_MS;
  });
}

export function evaluatePostFormation(
  candidate: PostFormationCandidate,
  now: Date,
):
  | { ok: false; reason: PostFormationSkipReason }
  | { ok: true; steps: PostFormationStepId[] } {
  if (candidate.status !== 'APPROVED') return { ok: false, reason: 'not-approved' };
  if (!candidate.sunbizApprovedAt) return { ok: false, reason: 'no-approval-time' };
  if (candidate.isTest) return { ok: false, reason: 'filing-test' };
  if (!hasRealSucceededPayment(candidate.payments)) return { ok: false, reason: 'unpaid' };
  if (candidate.accountStatus === 'GUEST') return { ok: false, reason: 'guest' };
  if (isPostFormationExcludedEmail(candidate.email)) return { ok: false, reason: 'test-address' };
  if (candidate.unsubscribed) return { ok: false, reason: 'unsubscribed' };
  const steps = duePostFormationSteps(candidate.sunbizApprovedAt, now, candidate.sentSteps);
  if (steps.length === 0) return { ok: false, reason: 'nothing-due' };
  return { ok: true, steps };
}
