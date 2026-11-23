// S-Corp consent (wizard step 9) and IRS Form 2553 generation.
//
// One rule for both: if any owner has neither an SSN nor an ITIN, do not
// collect the election consent and do not produce Form 2553. That is the
// foreign / no-SSN case, the same one classifyEinPathway sends to
// manual_foreign. An EIN (trust or estate) is still a US tax id.

import { classifyEinPathway } from './ein';
import { safeParseJson } from './utils';

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
 * True only for an explicit "No SSN or ITIN" choice (NONE) or a foreign
 * responsible party. A null, undefined, or not-yet-collected tax id does
 * not count: plain corporations store null until S-Corp is selected.
 * SSN, ITIN, and EIN (trust or estate) do not count either.
 */
export function hasShareholderWithoutTaxId(
  shareholders: readonly ShareholderTaxId[],
): boolean {
  return shareholders.some((person) => {
    const foreign = (person.responsiblePartyType ?? '').trim().toLowerCase() === 'foreign';
    if (
      foreign &&
      classifyEinPathway({
        responsiblePartyType: 'foreign',
        taxIdType: person.taxIdType ?? null,
      }) === 'manual_foreign'
    ) {
      return true;
    }
    return (person.taxIdType ?? '').trim().toUpperCase() === 'NONE';
  });
}

type StoredOwner = {
  taxIdType?: string | null;
  responsiblePartyType?: string | null;
};

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
      responsiblePartyType: owner.responsiblePartyType ?? null,
    }));
  } else if ((args.memberTaxInfo?.length ?? 0) > 0) {
    owners = args.memberTaxInfo!.map((owner) => ({
      taxIdType: owner.taxIdType ?? null,
      responsiblePartyType: owner.responsiblePartyType ?? null,
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

/**
 * Owners whose tax id was actually saved. Missing rows are not treated as
 * "no SSN" so an election chosen before step 9 keeps its price.
 */
export function recordedShareholderTaxIds(args: {
  entityType: string;
  optionalDetails: unknown;
  ein?: {
    responsiblePartyType?: string | null;
    taxIdType?: string | null;
    status?: string | null;
  } | null;
}): ShareholderTaxId[] {
  const optional =
    typeof args.optionalDetails === 'string'
      ? safeParseJson<Record<string, unknown> | null>(args.optionalDetails, null)
      : args.optionalDetails && typeof args.optionalDetails === 'object'
        ? (args.optionalDetails as Record<string, unknown>)
        : null;
  const shareStructure = optional?.shareStructure as
    | { shareholders?: StoredOwner[] | null }
    | null
    | undefined;
  const memberTaxInfo = optional?.memberTaxInfo as StoredOwner[] | null | undefined;
  return shareholderTaxIdsFromOptional({
    entityType: args.entityType,
    shareStructure: shareStructure ?? null,
    memberTaxInfo: memberTaxInfo ?? null,
    ein: args.ein,
  });
}

export type EinResponsibleParty = {
  responsiblePartyType?: string | null;
  taxIdType?: string | null;
  status?: string | null;
} | null;

/**
 * Same owner list for the order summary, the pay page, and the PaymentIntent.
 * Includes a foreign EIN responsible party when one is on file.
 */
export function sCorpOrderOwners(args: {
  entityType: string;
  optionalDetails: unknown;
  ein?: EinResponsibleParty;
}): ShareholderTaxId[] {
  return recordedShareholderTaxIds({
    entityType: args.entityType,
    optionalDetails: args.optionalDetails,
    ein: args.ein ?? null,
  });
}

/** The add-on card is only for an S-Corp election whose owners can sign Form 2553. */
export function sCorpAddOnCardOffered(args: {
  taxElection?: string | null;
  shareholders: readonly ShareholderTaxId[];
}): boolean {
  return args.taxElection === 'S_CORP' && !hasShareholderWithoutTaxId(args.shareholders);
}

/**
 * Slugs that will actually be charged. The $99 line is included only when the
 * card is offered, which is the same rule saveStep11 keeps on the filing.
 */
export function billableAddOnSlugs<T extends string>(
  addOnSlugs: readonly T[],
  shareholders: readonly ShareholderTaxId[],
  taxElection?: string | null,
): T[] {
  if (sCorpAddOnCardOffered({ taxElection, shareholders })) return [...addOnSlugs];
  return addOnSlugs.filter((slug) => slug !== 's_corp_election');
}
