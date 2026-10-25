// Dashboard orders for a certificate of status (cert_status) and a certified
// copy (cert_copy). Prices come from the formation catalog: LaunchForma's
// service margin plus the state's certificate fee. Standard and Premium
// formation packages already include both documents. A linked company stores
// STANDARD only as a placeholder tier and did not buy that package.

import {
  isActiveFormationState,
  type StateCode,
} from './formation-states';
import { type SiteLocale } from './pick-locale';
import {
  addOnPriceParts,
  tierBundledAddOns,
  type AddOnSlug,
  type EntityType,
  type PriceParts,
  type TierSlug,
} from './pricing';

export const CERTIFICATE_ADDON_SLUGS = ['cert_status', 'cert_copy'] as const;
export type CertificateAddOnSlug = (typeof CERTIFICATE_ADDON_SLUGS)[number];

/** Stripe PaymentIntent metadata.purpose for a dashboard certificate charge. */
export const CERTIFICATE_ORDER_PURPOSE = 'certificate_addon';

export const CERTIFICATE_DOCUMENT_TYPE: Record<
  CertificateAddOnSlug,
  'CERT_STATUS' | 'CERT_COPY'
> = {
  cert_status: 'CERT_STATUS',
  cert_copy: 'CERT_COPY',
};

export function isCertificateAddOnSlug(value: string | null | undefined): value is CertificateAddOnSlug {
  return value === 'cert_status' || value === 'cert_copy';
}

/**
 * Dashboard path for a certificate order. Pass `es` when the link or
 * redirect must stay on the Spanish site. The default is the unprefixed
 * path so next-intl Link can add the locale once.
 */
export function certificateOrderPath(
  filingId: string,
  slug: CertificateAddOnSlug,
  locale: SiteLocale = 'en',
): string {
  const path = `/dashboard/filings/${filingId}/certificates/${slug}`;
  return locale === 'es' ? `/es${path}` : path;
}

/** Customer-facing title. Stored document titles stay in English. */
export function displayedCertificateTitle(
  documentType: string,
  storedTitle: string,
  titles: Partial<Record<string, string | undefined>>,
): string {
  const translated = titles[documentType];
  if (translated) return translated;
  return storedTitle;
}

/** Admin list label. Existing rows may still store the older "Handling" name. */
export function adminAddOnLabel(slug: string | null | undefined, storedName: string): string {
  if (slug === 'cert_status') return 'Certificate of Status';
  if (slug === 'cert_copy') return 'Certified Copy';
  return storedName;
}

export function asTierSlug(tier: string | null | undefined): TierSlug {
  if (tier === 'BASIC' || tier === 'STANDARD' || tier === 'PREMIUM') return tier;
  return 'BASIC';
}

/** Active formation state, or Florida when the filing predates multi-state or is unknown. */
export function filingFormationState(state: string | null | undefined): StateCode {
  return isActiveFormationState(state) ? (state as StateCode) : 'FL';
}

export function filingEntityType(entityType: string | null | undefined): EntityType {
  return entityType === 'CORP' ? 'CORP' : 'LLC';
}

/** Filed with the state, or approved. Drafts and rejected filings have no entity yet. */
export function certificateEntityExists(status: string | null | undefined): boolean {
  return status === 'SUBMITTED' || status === 'APPROVED';
}

export interface CertificateDocumentRef {
  documentType: string;
  pendingState?: boolean | null;
}

export interface CertificateEligibilityInput {
  slug: CertificateAddOnSlug;
  status: string | null | undefined;
  tier: string | null | undefined;
  /** WIZARD formations bought a package. LINKED companies did not. */
  filingSource: string | null | undefined;
  addOnSlugs: readonly string[];
  documents?: readonly CertificateDocumentRef[];
}

function matchingDocuments(
  slug: CertificateAddOnSlug,
  documents: readonly CertificateDocumentRef[] | undefined,
): CertificateDocumentRef[] {
  const type = CERTIFICATE_DOCUMENT_TYPE[slug];
  return (documents ?? []).filter((doc) => doc.documentType === type);
}

/**
 * True when this filing should not be charged again: the formation package
 * includes the document, the customer already bought the add-on, or a
 * certificate file is already on the filing.
 */
export function certificateIncluded(input: CertificateEligibilityInput): boolean {
  if (input.addOnSlugs.includes(input.slug)) return true;
  if (matchingDocuments(input.slug, input.documents).length > 0) return true;
  if (input.filingSource === 'LINKED') return false;
  return tierBundledAddOns(asTierSlug(input.tier)).includes(input.slug as AddOnSlug);
}

export type CertificateOffer =
  | { kind: 'hidden' }
  | { kind: 'included'; pending: boolean }
  | { kind: 'orderable' };

export function certificateOffer(input: CertificateEligibilityInput): CertificateOffer {
  if (!certificateEntityExists(input.status)) return { kind: 'hidden' };
  if (!certificateIncluded(input)) return { kind: 'orderable' };
  const pending = matchingDocuments(input.slug, input.documents).some((doc) => doc.pendingState);
  return { kind: 'included', pending };
}

/** Service fee and state fee for one dashboard certificate order. */
export function certificateOrderQuote(
  slug: CertificateAddOnSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): PriceParts {
  return addOnPriceParts(slug, entityType, state);
}
