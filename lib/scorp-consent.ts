// S-Corp consent (wizard step 9) and IRS Form 2553 generation.
//
// One rule for both: if any owner has neither an SSN nor an ITIN, do not
// collect the election consent and do not produce Form 2553. That is the
// foreign / no-SSN case, the same one classifyEinPathway sends to
// manual_foreign. An EIN (trust or estate) is still a US tax id.

import { classifyEinPathway } from './ein';

/** Tax id types that are not the foreign / no-SSN pathway. */
const US_TAX_ID_TYPES = new Set(['SSN', 'ITIN', 'EIN']);

export type ShareholderTaxIdChoice = 'SSN' | 'ITIN' | 'EIN' | 'NONE';

export type ShareholderTaxId = {
  taxIdType?: string | null;
  /** 'foreign' when this owner is the no-SSN / no-ITIN EIN pathway. */
  responsiblePartyType?: string | null;
};

export function coerceShareholderTaxIdType(
  value: string | null | undefined,
): ShareholderTaxIdChoice {
  const type = (value ?? '').trim().toUpperCase();
  if (type === 'SSN' || type === 'ITIN' || type === 'EIN' || type === 'NONE') {
    return type;
  }
  return 'SSN';
}

/**
 * True when any owner has neither an SSN nor an ITIN.
 * A missing type, NONE, or a foreign responsible party counts.
 * SSN, ITIN, and EIN (trust or estate) do not.
 */
export function hasShareholderWithoutTaxId(
  shareholders: readonly ShareholderTaxId[],
): boolean {
  return shareholders.some((person) => {
    const foreign = (person.responsiblePartyType ?? '').trim().toLowerCase() === 'foreign';
    const type = (person.taxIdType ?? '').trim().toUpperCase();
    // NONE and blank are not US tax ids. Passing them through would look
    // truthy to classifyEinPathway and miss the manual_foreign pathway.
    const usTaxId = US_TAX_ID_TYPES.has(type) ? type : null;
    return (
      classifyEinPathway({
        responsiblePartyType: foreign ? 'foreign' : 'us',
        taxIdType: usTaxId,
      }) === 'manual_foreign'
    );
  });
}

type StoredOwner = { taxIdType?: string | null };

/**
 * Owners the server should judge before it asks for consent or builds Form 2553.
 * A saved EIN application on the manual_foreign pathway is included so the
 * guard still holds after the responsible party is recorded.
 */
export function shareholderTaxIdsFromOptional(args: {
  entityType: string;
  shareStructure?: { shareholders?: StoredOwner[] | null } | null;
  memberTaxInfo?: StoredOwner[] | null;
  memberCount?: number;
  ein?: {
    responsiblePartyType?: string | null;
    taxIdType?: string | null;
    status?: string | null;
  } | null;
}): ShareholderTaxId[] {
  let owners: ShareholderTaxId[];
  if (args.entityType === 'CORP' && (args.shareStructure?.shareholders?.length ?? 0) > 0) {
    owners = args.shareStructure!.shareholders!.map((owner) => ({
      taxIdType: owner.taxIdType ?? null,
    }));
  } else if ((args.memberTaxInfo?.length ?? 0) > 0) {
    owners = args.memberTaxInfo!.map((owner) => ({
      taxIdType: owner.taxIdType ?? null,
    }));
  } else if ((args.memberCount ?? 0) > 0) {
    owners = Array.from({ length: args.memberCount ?? 0 }, () => ({ taxIdType: null }));
  } else {
    owners = [];
  }

  const ein = args.ein;
  if (ein && (ein.responsiblePartyType === 'foreign' || ein.status === 'manual_foreign')) {
    owners = [
      ...owners,
      {
        taxIdType: ein.taxIdType ?? null,
        responsiblePartyType: 'foreign',
      },
    ];
  }
  return owners;
}

function electionSelected(args: {
  taxElection?: string | null;
  addOnSlugs?: readonly string[];
}): boolean {
  return (
    args.taxElection === 'S_CORP' || (args.addOnSlugs ?? []).includes('s_corp_election')
  );
}

/** Premium still asks for consent when every owner has a US tax id. Generation does not. */
function consentRequested(args: {
  taxElection?: string | null;
  addOnSlugs?: readonly string[];
  serviceTier?: string | null;
}): boolean {
  return electionSelected(args) || args.serviceTier === 'PREMIUM';
}

export function shouldCollectSCorpConsent(args: {
  taxElection?: string | null;
  addOnSlugs?: readonly string[];
  serviceTier?: string | null;
  shareholders: readonly ShareholderTaxId[];
}): boolean {
  if (!consentRequested(args)) return false;
  return !hasShareholderWithoutTaxId(args.shareholders);
}

export function shouldGenerateForm2553(args: {
  taxElection?: string | null;
  addOnSlugs?: readonly string[];
  shareholders: readonly ShareholderTaxId[];
}): boolean {
  if (!electionSelected(args)) return false;
  return !hasShareholderWithoutTaxId(args.shareholders);
}
