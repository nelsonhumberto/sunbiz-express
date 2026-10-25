import { EMAIL_STATUS_SKIPPED_TEST } from '@/lib/email-status';

/** How long a crashed PENDING claim can sit before another run takes it. */
export const MARKETING_CLAIM_STALE_MS = 15 * 60 * 1000;

/** Failed sends stop after this many claims so a dead mailbox cannot loop forever. */
export const MARKETING_CLAIM_MAX_ATTEMPTS = 3;

/**
 * These statuses are finished. A later run must not send again or open
 * another outbox row. SUPPRESSED and OPTED_OUT are final on purpose.
 */
export const MARKETING_FINAL_STATUSES = [
  'SENT',
  EMAIL_STATUS_SKIPPED_TEST,
  'SUPPRESSED',
  'OPTED_OUT',
] as const;

export interface MarketingClaimRow {
  status: string;
  claimedAt: Date;
  attemptCount?: number;
}

export type MarketingClaimPlan = 'insert' | 'reclaim' | 'skip';

export function isFinalMarketingStatus(status: string): boolean {
  return (MARKETING_FINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * One send per key. A successful send is marked SENT immediately, so a stale
 * PENDING reclaim cannot send it again. FAILED and a stale PENDING can be
 * taken again until the attempt cap. A fresh PENDING belongs to the worker
 * that inserted it.
 */
export function planMarketingClaim(
  existing: MarketingClaimRow | null,
  nowMs: number,
  staleMs = MARKETING_CLAIM_STALE_MS,
): MarketingClaimPlan {
  if (!existing) return 'insert';
  if (isFinalMarketingStatus(existing.status)) return 'skip';
  const attempts = existing.attemptCount ?? 0;
  if (attempts >= MARKETING_CLAIM_MAX_ATTEMPTS) return 'skip';
  if (existing.status === 'FAILED') return 'reclaim';
  if (existing.status === 'PENDING' && nowMs - existing.claimedAt.getTime() >= staleMs) {
    return 'reclaim';
  }
  return 'skip';
}

/**
 * Status to store the moment delivery returns. SENT and SKIPPED_TEST close
 * the claim. A suppression failure is final. Anything else stays retryable
 * until the attempt cap.
 */
export function claimStatusAfterSend(input: {
  deliveryStatus: string;
  errorMessage?: string | null;
}): string {
  if (input.deliveryStatus === 'SENT' || input.deliveryStatus === EMAIL_STATUS_SKIPPED_TEST) {
    return input.deliveryStatus;
  }
  if (input.deliveryStatus === 'OPTED_OUT') return 'OPTED_OUT';
  const message = (input.errorMessage ?? '').toLowerCase();
  if (input.deliveryStatus === 'SUPPRESSED' || message.includes('suppression list')) {
    return 'SUPPRESSED';
  }
  return 'FAILED';
}

export function postFormationSendKey(filingId: string, step: string): string {
  return `${filingId}:${step}`;
}

export function newsletterSendKey(email: string, issue: string): string {
  return `${email.trim().toLowerCase()}:${issue}`;
}
