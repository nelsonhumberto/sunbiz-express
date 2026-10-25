/** How long a crashed PENDING claim can sit before another run takes it. */
export const MARKETING_CLAIM_STALE_MS = 15 * 60 * 1000;

export interface MarketingClaimRow {
  status: string;
  claimedAt: Date;
}

export type MarketingClaimPlan = 'insert' | 'reclaim' | 'skip';

/**
 * One send per key. SENT blocks another attempt. FAILED and a stale PENDING
 * can be taken again. A fresh PENDING belongs to the worker that inserted it.
 */
export function planMarketingClaim(
  existing: MarketingClaimRow | null,
  nowMs: number,
  staleMs = MARKETING_CLAIM_STALE_MS,
): MarketingClaimPlan {
  if (!existing) return 'insert';
  if (existing.status === 'SENT') return 'skip';
  if (existing.status === 'FAILED') return 'reclaim';
  if (existing.status === 'PENDING' && nowMs - existing.claimedAt.getTime() >= staleMs) {
    return 'reclaim';
  }
  return 'skip';
}

export function postFormationSendKey(filingId: string, step: string): string {
  return `${filingId}:${step}`;
}

export function newsletterSendKey(email: string, issue: string): string {
  return `${email.trim().toLowerCase()}:${issue}`;
}
