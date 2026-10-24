import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';

const HIDDEN_SUCCESS_DOCUMENT_TYPES = new Set([
  'COVER_LETTER',
  'SUNBIZ_COVER_PAGE',
  'FILE_PACKAGE',
]);

/** True when this filing paid for an Operating Agreement (tier or add-on). */
export function filingShowsOperatingAgreement(args: {
  entityType: string;
  tier: TierSlug;
  addOnSlugs: AddOnSlug[];
  memberCount?: number;
}): boolean {
  return args.entityType === 'LLC' && filingHasOperatingAgreement(args);
}

/**
 * Customer downloads on the checkout success page. Operating Agreement is
 * included only when the filing is entitled to one.
 */
export function visibleSuccessDocuments<
  T extends { documentType: string; pendingState?: boolean | null },
>(documents: T[], showOperatingAgreement: boolean): T[] {
  return documents.filter((doc) => {
    if (doc.pendingState) return false;
    if (HIDDEN_SUCCESS_DOCUMENT_TYPES.has(doc.documentType)) return false;
    if (doc.documentType === 'OPERATING_AGREEMENT' && !showOperatingAgreement) return false;
    return true;
  });
}
