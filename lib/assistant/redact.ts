import 'server-only';

import { safeParseJson } from '@/lib/utils';

/**
 * A PII-safe summary of a filing for the model. We deliberately include only
 * non-sensitive fields the user is fine sharing (entity, state, tier, business
 * name, owner names + titles, city/state of the principal address) and NEVER
 * include SSN/ITIN/EIN, passport numbers, full street addresses, or anything
 * from the encrypted EIN application.
 */
export interface WizardSummary {
  filingId: string;
  entityType: string;
  state: string;
  serviceTier: string;
  taxElection: string | null;
  currentStep: number;
  status: string;
  businessName: string | null;
  hasPrincipalAddress: boolean;
  principalCityState: string | null;
  hasRegisteredAgent: boolean;
  registeredAgentIsOurs: boolean | null;
  people: Array<{ name: string; title: string }>;
  addOns: string[];
  hasSignature: boolean;
}

type FilingLike = {
  id: string;
  entityType: string;
  state: string | null;
  serviceTier: string;
  taxElection: string | null;
  currentStep: number;
  status: string;
  businessName: string | null;
  principalAddress: string | null;
  registeredAgent: string | null;
  incorporatorSignature: string | null;
  managersMembers?: Array<{ name: string; title: string }>;
  filingAdditionalServices?: Array<{ service: { serviceSlug: string } }>;
};

export function summarizeFiling(filing: FilingLike): WizardSummary {
  const principal = safeParseJson<{ city?: string; state?: string; street1?: string } | null>(
    filing.principalAddress,
    null,
  );
  const ra = safeParseJson<{ useOurService?: boolean; name?: string; street1?: string } | null>(
    filing.registeredAgent,
    null,
  );
  const principalCityState =
    principal?.city && principal?.state ? `${principal.city}, ${principal.state}` : null;
  const raSet = !!(ra && (ra.useOurService === true || (ra.name && ra.street1)));

  return {
    filingId: filing.id,
    entityType: filing.entityType,
    state: filing.state ?? 'FL',
    serviceTier: filing.serviceTier,
    taxElection: filing.taxElection ?? null,
    currentStep: filing.currentStep,
    status: filing.status,
    businessName: filing.businessName ?? null,
    hasPrincipalAddress: !!principal?.street1,
    principalCityState,
    hasRegisteredAgent: raSet,
    registeredAgentIsOurs: ra ? ra.useOurService === true : null,
    people: (filing.managersMembers ?? []).map((m) => ({ name: m.name, title: m.title })),
    addOns: (filing.filingAdditionalServices ?? []).map((s) => s.service.serviceSlug),
    hasSignature: !!filing.incorporatorSignature?.trim(),
  };
}
