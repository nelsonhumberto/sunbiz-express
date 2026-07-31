/**
 * Helpers to render filing documents from a live Filing record.
 * Used when regenerating Articles on download / Sunbiz file-package merge
 * so template fixes apply without re-submitting the filing.
 */

import { safeParseJson } from '@/lib/utils';
import {
  generateArticlesOfIncorporation,
  generateArticlesOfOrganization,
  type FilingForDoc,
} from '@/lib/pdf';

type FilingLike = {
  id: string;
  businessName: string | null;
  entityType: string;
  state: string;
  principalAddress: string | null;
  mailingAddress: string | null;
  registeredAgent: string | null;
  correspondenceContact: string | null;
  optionalDetails: string | null;
  incorporatorSignature: string | null;
  incorporatorSignedAt: Date | null;
  sunbizFilingNumber: string | null;
  sunbizApprovedAt: Date | null;
  submittedAt: Date | null;
  managersMembers: FilingForDoc['managersMembers'];
};

export function toFilingForDoc(filing: FilingLike): FilingForDoc {
  return {
    id: filing.id,
    businessName: filing.businessName ?? '',
    entityType: filing.entityType as 'LLC' | 'CORP',
    state: filing.state,
    principalAddress: safeParseJson(filing.principalAddress, null),
    mailingAddress: safeParseJson<unknown>(filing.mailingAddress, null) as FilingForDoc['mailingAddress'],
    registeredAgent: safeParseJson(filing.registeredAgent, null),
    correspondenceContact: safeParseJson(filing.correspondenceContact, null),
    optionalDetails: safeParseJson(filing.optionalDetails, null),
    incorporatorSignature: filing.incorporatorSignature,
    incorporatorSignedAt: filing.incorporatorSignedAt,
    sunbizFilingNumber: filing.sunbizFilingNumber,
    sunbizApprovedAt: filing.sunbizApprovedAt,
    submittedAt: filing.submittedAt,
    managersMembers: filing.managersMembers,
  };
}

export function renderArticlesHtml(filing: FilingLike): string {
  const doc = toFilingForDoc(filing);
  return filing.entityType === 'LLC'
    ? generateArticlesOfOrganization(doc)
    : generateArticlesOfIncorporation(doc);
}
