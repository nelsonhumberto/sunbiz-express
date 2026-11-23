import type { Filing, ManagerMember, FilingAdditionalService, AdditionalService } from '@prisma/client';
import type { EinResponsibleParty } from '@/lib/scorp-consent';

export type WizardFiling = Filing & {
  managersMembers: ManagerMember[];
  filingAdditionalServices: (FilingAdditionalService & { service: AdditionalService })[];
  /** Loaded for order totals. Absent on callers that never fetched the relation. */
  einApplication?: EinResponsibleParty;
};
