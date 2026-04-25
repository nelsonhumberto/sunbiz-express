import type { Filing, ManagerMember, FilingAdditionalService, AdditionalService } from '@prisma/client';

export type WizardFiling = Filing & {
  managersMembers: ManagerMember[];
  filingAdditionalServices: (FilingAdditionalService & { service: AdditionalService })[];
};
