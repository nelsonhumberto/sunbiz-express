import { AFFILIATE_STORAGE_KEY, parseStoredReferral, type AffiliateClick } from '@/lib/affiliate';

/** Read the first-party referral click from localStorage. Null in private mode. */
export function readLocalReferral(): AffiliateClick | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStoredReferral(window.localStorage.getItem(AFFILIATE_STORAGE_KEY));
  } catch {
    return null;
  }
}
