'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWizardActor } from '@/lib/guest';
import { encryptString } from '@/lib/encryption';
import {
  computeCost,
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import {
  validateBusinessName,
  validateRegisteredAgentAddress,
  validateGeneralAddress,
  isValidEffectiveDate,
} from '@/lib/formation-validation';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { safeParseJson } from '@/lib/utils';

function asStateCode(input: string | null | undefined): StateCode {
  const upper = (input ?? 'FL').toUpperCase();
  return ACTIVE_FORMATION_STATES.includes(upper as StateCode)
    ? (upper as StateCode)
    : 'FL';
}

// ─── Internal helpers ─────────────────────────────────────────────────────

async function getFilingAddOnSlugs(filingId: string): Promise<AddOnSlug[]> {
  const services = await prisma.filingAdditionalService.findMany({
    where: { filingId },
    include: { service: true },
  });
  return services.map((s) => s.service.serviceSlug as AddOnSlug);
}

/**
 * Auto-populate the filing's correspondence email from the authenticated user
 * when it has not been set yet. The standalone correspondence wizard step was
 * removed; the account email is the source of truth.
 */
async function ensureCorrespondenceFromSession(
  filingId: string,
  existing: string | null,
  email: string | null | undefined,
) {
  if (existing) return;
  const e = (email ?? '').trim();
  if (!e) return;
  await prisma.filing.update({
    where: { id: filingId },
    data: {
      correspondenceContact: JSON.stringify({ email: e, source: 'account' }),
    },
  });
}

async function persistManagementType(
  filingId: string,
  existingOptionalDetails: string | null,
  managementType: 'member-managed' | 'manager-managed' | undefined,
  entityType: 'LLC' | 'CORP',
) {
  if (entityType !== 'LLC') return;
  if (!managementType) return;
  const prev = safeParseJson<Record<string, unknown> | null>(existingOptionalDetails, null) ?? {};
  await prisma.filing.update({
    where: { id: filingId },
    data: {
      optionalDetails: JSON.stringify({ ...prev, managementType }),
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function getFilingForUser(filingId: string) {
  const session = await auth();
  // Resolve the actor — authenticated NextAuth user OR a GUEST identified by
  // the signed cookie. Guests are first-class participants in the wizard.
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  if (!actor) redirect('/sign-in');
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { managersMembers: { orderBy: { position: 'asc' } } },
  });
  if (!filing || filing.userId !== actor.id) {
    throw new Error('Filing not found');
  }
  return { filing, session, actor };
}

function markStepComplete(completedJson: string, step: number) {
  const completed = safeParseJson<number[]>(completedJson, []);
  if (!completed.includes(step)) completed.push(step);
  return JSON.stringify(completed.sort((a, b) => a - b));
}

async function recomputeCost(filingId: string) {
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
    },
  });
  if (!filing) return;
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug
  );
  const optional = safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null);
  const processingOptionId =
    optional && typeof optional.processingOption === 'string'
      ? (optional.processingOption as string)
      : undefined;
  const breakdown = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
    state: asStateCode(filing.state),
    processingOptionId,
  });
  await prisma.filing.update({
    where: { id: filingId },
    data: {
      // Customer-facing pricing is presented as a single all-in package; the
      // DB columns now act as the internal accounting ledger:
      //   stateFeeCents     = total amount we forward to Florida
      //   serviceFeeCents   = LaunchForma margin baked into the package
      //   addOnsTotalCents  = customer-paid add-on subtotal
      stateFeeCents: breakdown.governmentRemittanceCents,
      serviceFeeCents: breakdown.packageMarginCents,
      addOnsTotalCents: breakdown.addOnsCents,
      totalCents: breakdown.totalCents,
    },
  });
}

// ─── Step 1: Entity & State ────────────────────────────────────────────

const Step1Schema = z.object({
  filingId: z.string(),
  entityType: z.enum(['LLC', 'CORP']),
  /** USPS code of the state to file in. Defaults to existing filing state. */
  state: z.enum(['FL', 'WY', 'DE']).optional(),
  /** Federal tax election. 'S_CORP' elects S-Corporation taxation. */
  taxElection: z.enum(['S_CORP']).nullable().optional(),
});

export async function saveStep1(input: z.infer<typeof Step1Schema>) {
  const data = Step1Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);
  const nextState = data.state ?? asStateCode(filing.state);
  const taxElection = data.taxElection ?? null;
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      entityType: data.entityType,
      state: nextState,
      taxElection,
      currentStep: Math.max(filing.currentStep, 2),
      completedSteps: markStepComplete(filing.completedSteps, 1),
    },
  });

  // Keep the S-Corp election service in sync with the Step-1 choice so cost
  // and the Form 2553 collection are correct regardless of when the user
  // reaches the add-ons step. Premium already bundles it (don't double-add).
  await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', filing.serviceTier as TierSlug);

  await recomputeCost(filing.id);
  revalidatePath(`/wizard/${filing.id}`);
}

/**
 * Attach or detach the `s_corp_election` add-on to match the formation's tax
 * election. No-op for Premium (bundled). Idempotent.
 */
async function syncSCorpElectionAddOn(
  filingId: string,
  elected: boolean,
  tier: TierSlug,
) {
  const svc = await prisma.additionalService.findFirst({
    where: { serviceSlug: 's_corp_election' },
  });
  if (!svc) return;

  const existing = await prisma.filingAdditionalService.findFirst({
    where: { filingId, serviceId: svc.id },
  });

  // Premium bundles the election — never bill it as a line item.
  const shouldHave = elected && tier !== 'PREMIUM';

  if (shouldHave && !existing) {
    await prisma.filingAdditionalService.create({
      data: {
        filingId,
        serviceId: svc.id,
        quantity: 1,
        priceCents: svc.priceCents,
        status: 'PENDING',
      },
    });
  } else if (!shouldHave && existing && !elected) {
    // Only auto-remove when the user actively chose a non-S-Corp election at
    // Step 1 (so we don't clobber a Premium bundle or a manual selection).
    await prisma.filingAdditionalService.delete({ where: { id: existing.id } });
  }
}

// ─── Step 2: Business name ────────────────────────────────────────────

const Step2Schema = z.object({
  filingId: z.string(),
  businessName: z.string().min(2).max(100),
  available: z.boolean().optional(),
});

export async function saveStep2(input: z.infer<typeof Step2Schema>) {
  const data = Step2Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);

  const validation = validateBusinessName(
    data.businessName,
    filing.entityType as 'LLC' | 'CORP',
    asStateCode(filing.state),
  );
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      businessName: data.businessName.trim(),
      nameAvailable: data.available ?? null,
      nameCheckedAt: new Date(),
      currentStep: Math.max(filing.currentStep, 3),
      completedSteps: markStepComplete(filing.completedSteps, 2),
    },
  });
  return { ok: true };
}

// ─── Step 3: Tier ──────────────────────────────────────────────────────

const Step3Schema = z.object({
  filingId: z.string(),
  tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
});

export async function saveStep3(input: z.infer<typeof Step3Schema>) {
  const data = Step3Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      serviceTier: data.tier,
      currentStep: Math.max(filing.currentStep, 4),
      completedSteps: markStepComplete(filing.completedSteps, 3),
    },
  });
  // Keep the S-Corp election service consistent with the new tier (Premium
  // bundles it; other tiers bill it à la carte when S-Corp was elected).
  await syncSCorpElectionAddOn(filing.id, filing.taxElection === 'S_CORP', data.tier);
  await recomputeCost(filing.id);
}

// Inline tier-change endpoint used by the Step 11 add-on upsell card. It only
// updates serviceTier (preserves wizard progress) and recomputes the cost so
// the sidebar instantly reflects the new tier.
export async function upgradeTier(input: { filingId: string; tier: 'BASIC' | 'STANDARD' | 'PREMIUM' }) {
  const data = Step3Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);
  await prisma.filing.update({
    where: { id: filing.id },
    data: { serviceTier: data.tier },
  });
  await recomputeCost(filing.id);
  return { ok: true as const };
}

// ─── Step 4 & 5: Addresses ─────────────────────────────────────────────

const AddressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(5).max(10),
  inCareOf: z.string().optional().nullable(),
});

export async function saveStep4(input: { filingId: string; address: z.infer<typeof AddressSchema> }) {
  const address = AddressSchema.parse(input.address);
  const { filing } = await getFilingForUser(input.filingId);
  const v = validateGeneralAddress(address);
  if (!v.valid) return { ok: false, error: v.error };
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      principalAddress: JSON.stringify(address),
      currentStep: Math.max(filing.currentStep, 5),
      completedSteps: markStepComplete(filing.completedSteps, 4),
    },
  });
  return { ok: true };
}

export async function saveStep5(input: {
  filingId: string;
  sameAsPrincipal: boolean;
  address?: z.infer<typeof AddressSchema>;
}) {
  const { filing } = await getFilingForUser(input.filingId);
  let mailing: string;
  if (input.sameAsPrincipal) {
    mailing = JSON.stringify('SAME_AS_PRINCIPAL');
  } else {
    if (!input.address) return { ok: false, error: 'Mailing address is required.' };
    const address = AddressSchema.parse(input.address);
    const v = validateGeneralAddress(address);
    if (!v.valid) return { ok: false, error: v.error };
    mailing = JSON.stringify(address);
  }
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      mailingAddress: mailing,
      currentStep: Math.max(filing.currentStep, 6),
      completedSteps: markStepComplete(filing.completedSteps, 5),
    },
  });
  return { ok: true };
}

// ─── Step 6: Registered Agent ──────────────────────────────────────────

const RegisteredAgentSchema = z.object({
  filingId: z.string(),
  useOurService: z.boolean(),
  name: z.string().min(1).max(255),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  street1: z.string().min(1),
  street2: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5).max(10),
  signature: z.string().min(1).max(255),
});

export async function saveStep6(input: z.infer<typeof RegisteredAgentSchema>) {
  const data = RegisteredAgentSchema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);

  if (!data.useOurService) {
    const v = validateRegisteredAgentAddress(
      {
        street1: data.street1,
        street2: data.street2 ?? undefined,
        city: data.city,
        state: data.state,
        zip: data.zip,
      },
      asStateCode(filing.state),
    );
    if (!v.valid) return { ok: false, error: v.error };
  }

  const ra = {
    type: data.useOurService ? 'internal' : 'external',
    useOurService: data.useOurService,
    name: data.name,
    email: data.email,
    phone: data.phone,
    street1: data.street1,
    street2: data.street2 ?? undefined,
    city: data.city,
    state: data.state,
    zip: data.zip,
    signature: data.signature,
    signedAt: new Date().toISOString(),
  };

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      registeredAgent: JSON.stringify(ra),
      currentStep: Math.max(filing.currentStep, 7),
      completedSteps: markStepComplete(filing.completedSteps, 6),
    },
  });
  return { ok: true };
}

// ─── Step 7: Members/Managers ──────────────────────────────────────────
//
// Note: ownership percentages are only collected and persisted when the
// filing is entitled to an Operating Agreement (Standard/Premium tier or
// Starter + OA add-on). Without OA entitlement we drop them so they don't
// leak into documents the customer hasn't paid for.

const ManagementTypeSchema = z.enum(['member-managed', 'manager-managed']).optional();

const MemberSchema = z.object({
  // Title enum: legacy LLC titles (MGR/MGRM/AMBR/AP) + corporation roles.
  // For CORP, DIRECTOR is used for board members and PRESIDENT/TREASURER/
  // SECRETARY are the three Florida-required officer roles; OFFICER stays
  // as a catch-all for any extra officers the customer wants to record.
  title: z.enum([
    'MGR',
    'MGRM',
    'AMBR',
    'AP',
    'OFFICER',
    'DIRECTOR',
    'PRESIDENT',
    'TREASURER',
    'SECRETARY',
  ]),
  name: z.string().min(1).max(255),
  street1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
  /** Owner type: "individual" (default) or "business" for entity owners. */
  ownerType: z.enum(['individual', 'business']).optional(),
  /** Business owner: legal entity name (for printed documents). */
  businessLegalName: z.string().optional(),
  /** Business owner: state/country of formation. */
  businessJurisdiction: z.string().optional(),
  /** Business owner: optional contact/authorized signer name. */
  signerName: z.string().optional(),
});

const Step7Schema = z.object({
  filingId: z.string(),
  managementType: ManagementTypeSchema,
  members: z.array(MemberSchema).min(1),
  /**
   * Delaware-only: customer preference about whether to include the initial
   * LLC member information on the publicly-filed Certificate of Formation.
   * Delaware does not require it; we default to NOT disclosing for privacy.
   */
  includeMembersOnArticles: z.boolean().optional(),
});

export async function saveStep7(input: z.infer<typeof Step7Schema>) {
  const data = Step7Schema.parse(input);
  const { filing, actor } = await getFilingForUser(data.filingId);

  const members = data.members.map((m) => ({ ...m })); // mutable copy
  const entityType = filing.entityType as 'LLC' | 'CORP';

  // Require management type for LLCs.
  if (entityType === 'LLC' && !data.managementType) {
    return { ok: false, error: 'Select whether this LLC is member-managed or manager-managed.' };
  }

  // Manager-managed LLCs must have at least one MGR / MGRM.
  if (entityType === 'LLC' && data.managementType === 'manager-managed') {
    const hasManager = members.some((m) => m.title === 'MGR' || m.title === 'MGRM');
    if (!hasManager) {
      return {
        ok: false,
        error: 'Manager-managed LLCs require at least one Manager (MGR or MGRM).',
      };
    }
  }

  // Corporation rules:
  //   • A business entity cannot itself be a director/officer of a corp —
  //     directors and officers must be natural persons. (Florida 607.0843
  //     and IRS Form SS-4 guidance.)
  //   • Florida 607.08401 requires the corp to have officers described in
  //     its bylaws. We require the three universally-recognized officer
  //     roles (President, Treasurer, Secretary) and at least one Director
  //     so banks, the IRS, and downstream documents always have someone
  //     identified for each function.
  if (entityType === 'CORP') {
    for (const m of members) {
      if (m.ownerType === 'business') {
        return {
          ok: false,
          error: 'Corporations cannot list a business entity as a director or officer — only individuals.',
        };
      }
    }
    const requireRole = (titleSet: string[], errorMsg: string) => {
      const ok = members.some(
        (m) => titleSet.includes(m.title) && m.name.trim().length > 0,
      );
      if (!ok) return errorMsg;
      return null;
    };
    const directorErr = requireRole(['DIRECTOR'], 'Add at least one director with a name.');
    if (directorErr) return { ok: false, error: directorErr };
    const presidentErr = requireRole(
      ['PRESIDENT'],
      "Enter the President / CEO's name.",
    );
    if (presidentErr) return { ok: false, error: presidentErr };
    const treasurerErr = requireRole(
      ['TREASURER'],
      "Enter the Treasurer / CFO's name.",
    );
    if (treasurerErr) return { ok: false, error: treasurerErr };
    const secretaryErr = requireRole(['SECRETARY'], "Enter the Secretary's name.");
    if (secretaryErr) return { ok: false, error: secretaryErr };
  }

  const oaEntitled =
    entityType === 'LLC' &&
    filingHasOperatingAgreement({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs: await getFilingAddOnSlugs(filing.id),
      memberCount: members.length,
    });

  if (oaEntitled) {
    if (members.length === 1) {
      members[0].ownershipPercentage = 100;
    } else {
      const percentages = members.map((m) => m.ownershipPercentage);
      if (percentages.some((p) => p == null)) {
        return {
          ok: false,
          error:
            'Ownership percentage is required for every member when an Operating Agreement is included.',
        };
      }
      const sum = percentages.reduce<number>((acc, p) => acc + (p as number), 0);
      if (Math.abs(sum - 100) > 0.01) {
        return {
          ok: false,
          error: `Ownership percentages must total 100% (currently ${sum.toFixed(2)}%).`,
        };
      }
    }
  } else {
    for (const m of members) m.ownershipPercentage = undefined;
  }

  // Validate business owners — if ownerType="business" we need a legal name
  // and jurisdiction. Individual owners just need name + (optional) address.
  for (const m of members) {
    if (m.ownerType === 'business') {
      if (!m.businessLegalName?.trim()) {
        return {
          ok: false,
          error: 'Business owners require a legal entity name.',
        };
      }
      if (!m.businessJurisdiction?.trim()) {
        return {
          ok: false,
          error: 'Business owners require a state or country of formation.',
        };
      }
    }
  }

  await prisma.managerMember.deleteMany({ where: { filingId: filing.id } });
  await prisma.managerMember.createMany({
    data: members.map((m, idx) => ({
      filingId: filing.id,
      title: m.title,
      // For business owners, the publicly-printed name is the legal entity
      // name. We populate `name` with that value so legacy callers (PDF
      // generation, dashboard cards) keep working without branching.
      name: m.ownerType === 'business' ? (m.businessLegalName ?? m.name) : m.name,
      street1: m.street1,
      city: m.city,
      state: m.state,
      zip: m.zip,
      ownershipPercentage: m.ownershipPercentage,
      position: idx,
      ownerType: m.ownerType ?? 'individual',
      businessLegalName: m.ownerType === 'business' ? m.businessLegalName : null,
      businessJurisdiction: m.ownerType === 'business' ? m.businessJurisdiction : null,
      signerName: m.ownerType === 'business' ? m.signerName ?? null : null,
    })),
  });

  await persistManagementType(filing.id, filing.optionalDetails, data.managementType, entityType);

  // Persist Delaware LLC member-disclosure choice into optionalDetails so the
  // PDF generator (and admin views) can honour it.
  if (filing.state?.toUpperCase() === 'DE' && entityType === 'LLC') {
    const prev = safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null) ?? {};
    await prisma.filing.update({
      where: { id: filing.id },
      data: {
        optionalDetails: JSON.stringify({
          ...prev,
          includeMembersOnArticles: data.includeMembersOnArticles ?? false,
        }),
      },
    });
  }

  // Auto-populate correspondence contact from the authenticated user (or
  // guest) email, since the standalone correspondence step was removed.
  await ensureCorrespondenceFromSession(
    filing.id,
    filing.correspondenceContact,
    actor.email,
  );

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      currentStep: Math.max(filing.currentStep, 8),
      completedSteps: markStepComplete(filing.completedSteps, 7),
    },
  });
  return { ok: true };
}

// ─── Step 8 (was 9): Optional details ──────────────────────────────────

/**
 * One shareholder of the corporation, captured for the share-allocation
 * UI on Step 8 (and required for the S-corp election when included).
 * The Tax-ID field is plain text on the wire; the server encrypts it and
 * only persists the ciphertext + last-4 to disk.
 */
const ShareholderSchema = z.object({
  name: z.string().min(1).max(255),
  street1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  email: z.string().optional(),
  shares: z.number().int().min(0).optional(),
  /** Tax ID type — only collected when S-corp election is in the package. */
  taxIdType: z.enum(['SSN', 'EIN']).optional(),
  /** Plain-text 9-digit Tax ID (encrypted before persistence). */
  taxId: z.string().optional(),
  /** Tax year end in MM/DD (Form 2553 Column N). */
  taxYearEnd: z.string().optional(),
  /** S-corp election consent (Form 2553 Column K). */
  sCorpConsent: z.boolean().optional(),
});

const ShareStructureSchema = z.object({
  issuedShares: z.number().int().min(0).optional(),
  shareholders: z.array(ShareholderSchema).optional(),
});

/**
 * One LLC member's S-corp election data. LLCs have members (not shareholders),
 * so when an LLC elects S-corp we collect the same Form 2553 fields keyed to the
 * member instead of a share allocation. Tax IDs are encrypted server-side.
 */
const MemberTaxInfoSchema = z.object({
  memberId: z.string().optional(),
  name: z.string().min(1).max(255),
  taxIdType: z.enum(['SSN', 'EIN']).optional(),
  taxId: z.string().optional(),
  taxYearEnd: z.string().optional(),
  sCorpConsent: z.boolean().optional(),
  ownershipPercentage: z.number().optional(),
});

const Step9Schema = z.object({
  filingId: z.string(),
  effectiveDate: z.string().optional(),
  authorizedShares: z.number().int().min(1).optional(),
  /** Delaware corp only: par value per share (cents). 0 = no par value. */
  parValueCents: z.number().int().min(0).optional(),
  /** Corporation share / shareholder allocation. */
  shareStructure: ShareStructureSchema.optional(),
  /** LLC S-corp member election data (Form 2553) — LLC filings only. */
  memberTaxInfo: z.array(MemberTaxInfoSchema).optional(),
  professionalPurpose: z.string().optional(),
  businessPurpose: z.string().optional(),
  /** Wyoming consent flag: required for organizer's electronic service. */
  electronicServiceConsent: z.boolean().optional(),
  /** Wyoming requires the organizer's email on the Articles. */
  organizerEmail: z.string().email().optional().or(z.literal('')),
  /** Customer-selected processing-speed option id, looked up per state. */
  processingOption: z.string().optional(),
  /**
   * Customer expressed interest in foreign-qualifying this entity in another
   * state after formation. Captured here so we can follow up post-formation
   * once the dedicated foreign-qualification product launches.
   */
  foreignRegistrationInterest: z.boolean().optional(),
});

function looksLikeNineDigitTaxId(value: string | undefined): boolean {
  if (!value) return false;
  return /^\d{9}$/.test(value.replace(/\D/g, ''));
}

export async function saveStep9(
  input: z.infer<typeof Step9Schema>,
): Promise<{ ok: boolean; error?: string }> {
  const data = Step9Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);

  if (data.effectiveDate) {
    const parsed = new Date(data.effectiveDate);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'Effective date is not a valid date.' };
    }
    const v = isValidEffectiveDate(parsed, asStateCode(filing.state));
    if (!v.valid) return { ok: false, error: v.error };
  }

  // Resolve whether S-corp election applies once — both the corp share table
  // and the LLC member branch below need it.
  const addOnSlugs = await getFilingAddOnSlugs(filing.id);
  const sCorpElected =
    filing.taxElection === 'S_CORP' || // authoritative Step-1 choice
    addOnSlugs.includes('s_corp_election') ||
    (filing.serviceTier as TierSlug) === 'PREMIUM'; // Premium bundles S-corp

  // Build the share-structure payload. We encrypt any Tax IDs and only
  // store the encrypted ciphertext + last-4 so plaintext SSNs never sit
  // in the JSON blob. When S-corp election is included in the package,
  // each shareholder must consent and provide a Tax ID (Form 2553).
  let shareStructurePersisted: Record<string, unknown> | undefined;
  if (data.shareStructure && filing.entityType === 'CORP') {
    const issued = data.shareStructure.issuedShares ?? 0;
    const authorized = data.authorizedShares ?? 0;
    if (issued > authorized && authorized > 0) {
      return {
        ok: false,
        error: `Issued shares (${issued}) cannot exceed authorized shares (${authorized}).`,
      };
    }

    const shareholders = data.shareStructure.shareholders ?? [];
    if (shareholders.length > 0) {
      const sum = shareholders.reduce((acc, s) => acc + (s.shares ?? 0), 0);
      if (issued > 0 && sum !== issued) {
        return {
          ok: false,
          error: `Shareholder allocations (${sum}) must add up to issued shares (${issued}).`,
        };
      }
    }

    // S-corp election turns on stricter validation: each shareholder must
    // have consented AND provided a valid 9-digit Tax ID. We surface a
    // friendly error rather than throwing.
    if (sCorpElected) {
      for (const s of shareholders) {
        if (!s.sCorpConsent) {
          return {
            ok: false,
            error: 'Each shareholder must consent to the S-Corp election.',
          };
        }
        if (!s.taxId || !looksLikeNineDigitTaxId(s.taxId)) {
          return {
            ok: false,
            error: 'Each shareholder must provide a valid 9-digit Tax ID for the S-Corp election.',
          };
        }
      }
    }

    const persistedShareholders = shareholders.map((s) => {
      let taxIdLast4: string | null = null;
      let taxIdEncrypted: string | null = null;
      if (sCorpElected && s.taxId) {
        const digits = s.taxId.replace(/\D/g, '');
        taxIdLast4 = digits.slice(-4);
        taxIdEncrypted = encryptString(digits);
      }
      return {
        name: s.name.trim(),
        street1: s.street1?.trim() ?? null,
        city: s.city?.trim() ?? null,
        state: s.state?.trim() ?? null,
        zip: s.zip?.trim() ?? null,
        email: s.email?.trim() ?? null,
        shares: s.shares ?? 0,
        taxIdType: sCorpElected ? s.taxIdType ?? 'SSN' : null,
        taxIdLast4,
        taxIdEncrypted,
        taxYearEnd: sCorpElected ? s.taxYearEnd ?? '12/31' : null,
        sCorpConsent: sCorpElected ? !!s.sCorpConsent : null,
      };
    });

    shareStructurePersisted = {
      issuedShares: issued,
      shareholders: persistedShareholders,
      sCorpElected,
    };
  }

  // LLC electing S-corp: collect/encrypt each member's Tax ID + consent so the
  // Form 2553 can be prepared. Mirrors the corp shareholder validation.
  let memberTaxInfoPersisted: Array<Record<string, unknown>> | undefined;
  if (filing.entityType !== 'CORP' && sCorpElected && data.memberTaxInfo) {
    // Prior member Tax IDs let a member re-save the step without re-typing their
    // SSN (we only ever hold the ciphertext + last-4, never plaintext, on disk).
    const priorOptional = safeParseJson<{
      memberTaxInfo?: Array<{
        memberId?: string | null;
        name?: string;
        taxIdEncrypted?: string | null;
        taxIdLast4?: string | null;
      }>;
    } | null>(filing.optionalDetails, null);
    const priorMembers = priorOptional?.memberTaxInfo ?? [];

    for (const m of data.memberTaxInfo) {
      const prior = priorMembers.find(
        (p) => (m.memberId && p.memberId === m.memberId) || p.name === m.name,
      );
      if (!m.sCorpConsent) {
        return { ok: false, error: 'Each member must consent to the S-Corp election.' };
      }
      const hasNewId = looksLikeNineDigitTaxId(m.taxId);
      if (!hasNewId && !prior?.taxIdEncrypted) {
        return {
          ok: false,
          error: 'Each member must provide a valid 9-digit Tax ID for the S-Corp election.',
        };
      }
    }

    memberTaxInfoPersisted = data.memberTaxInfo.map((m) => {
      const prior = priorMembers.find(
        (p) => (m.memberId && p.memberId === m.memberId) || p.name === m.name,
      );
      const digits = (m.taxId ?? '').replace(/\D/g, '');
      const hasNewId = /^\d{9}$/.test(digits);
      return {
        memberId: m.memberId ?? null,
        name: m.name.trim(),
        taxIdType: m.taxIdType ?? 'SSN',
        taxIdLast4: hasNewId ? digits.slice(-4) : prior?.taxIdLast4 ?? null,
        taxIdEncrypted: hasNewId ? encryptString(digits) : prior?.taxIdEncrypted ?? null,
        taxYearEnd: m.taxYearEnd ?? '12/31',
        sCorpConsent: true,
        ownershipPercentage: m.ownershipPercentage ?? null,
      };
    });
  }

  // Preserve any management info already saved in optionalDetails.
  const prev = safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null) ?? {};
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      optionalDetails: JSON.stringify({
        ...prev,
        effectiveDate: data.effectiveDate || undefined,
        authorizedShares: data.authorizedShares,
        parValueCents: data.parValueCents,
        shareStructure: shareStructurePersisted,
        memberTaxInfo: memberTaxInfoPersisted,
        professionalPurpose: data.professionalPurpose || undefined,
        businessPurpose: data.businessPurpose || undefined,
        electronicServiceConsent: data.electronicServiceConsent,
        organizerEmail: data.organizerEmail || undefined,
        processingOption: data.processingOption || undefined,
        foreignRegistrationInterest: data.foreignRegistrationInterest,
      }),
      currentStep: Math.max(filing.currentStep, 9),
      completedSteps: markStepComplete(filing.completedSteps, 8),
    },
  });
  // Processing option affects pricing — recompute so the customer sees the
  // new total in the cost sidebar before reaching payment.
  await recomputeCost(filing.id);
  return { ok: true };
}

// ─── Step 9 (was 10): Review & sign ────────────────────────────────────

const Step10Schema = z.object({
  filingId: z.string(),
  signature: z.string().min(2).max(255),
  confirmAccurate: z.boolean(),
});

export async function saveStep10(input: z.infer<typeof Step10Schema>) {
  const data = Step10Schema.parse(input);
  if (!data.confirmAccurate) return { ok: false, error: 'You must confirm the information is accurate.' };
  const { filing, actor } = await getFilingForUser(data.filingId);

  // Final safety net: ensure the correspondence email is populated before
  // the filing can be signed (covers any drafts that skipped step 7 logic).
  await ensureCorrespondenceFromSession(
    filing.id,
    filing.correspondenceContact,
    actor.email,
  );

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      incorporatorSignature: data.signature,
      incorporatorSignedAt: new Date(),
      confirmationAccepted: true,
      currentStep: Math.max(filing.currentStep, 10),
      completedSteps: markStepComplete(filing.completedSteps, 9),
    },
  });
  return { ok: true };
}

// ─── Step 10 (was 11): Add-ons ─────────────────────────────────────────

export async function saveStep11(input: { filingId: string; addOnSlugs: string[] }) {
  const { filing } = await getFilingForUser(input.filingId);

  const services = await prisma.additionalService.findMany({
    where: { serviceSlug: { in: input.addOnSlugs } },
  });

  await prisma.filingAdditionalService.deleteMany({ where: { filingId: filing.id } });
  await prisma.filingAdditionalService.createMany({
    data: services.map((s) => ({
      filingId: filing.id,
      serviceId: s.id,
      quantity: 1,
      priceCents: s.priceCents,
      status: 'PENDING',
    })),
  });

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      currentStep: Math.max(filing.currentStep, 11),
      completedSteps: markStepComplete(filing.completedSteps, 10),
    },
  });

  // Keep the S-Corp election service consistent with the Step-1 tax election no
  // matter what the add-ons screen submitted (e.g. "Skip to payment" or
  // deselecting it). This prevents under-billing where Form 2553 still
  // generates from taxElection but the $99 line item was dropped.
  await syncSCorpElectionAddOn(
    filing.id,
    filing.taxElection === 'S_CORP',
    filing.serviceTier as TierSlug,
  );

  await recomputeCost(filing.id);

  // After add-ons change, ownership percentages may have just become
  // entitled (or no longer entitled). Re-validate by re-running step 7's
  // entitlement gate against the current member set.
  await reconcileOwnershipPercentages(filing.id);

  return { ok: true };
}

/**
 * Ensure ownership percentages on a filing's members are consistent with
 * the filing's current OA entitlement. Called after tier or add-on changes.
 *  - If now entitled and a single member exists with no percentage, set 100.
 *  - If no longer entitled, clear any previously-saved percentages.
 *  - If multi-member and entitled but percentages don't total 100, leave
 *    them in place so step 7 can re-prompt (we don't fail asynchronously).
 */
async function reconcileOwnershipPercentages(filingId: string) {
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { managersMembers: { orderBy: { position: 'asc' } } },
  });
  if (!filing || filing.entityType !== 'LLC') return;

  const addOnSlugs = await getFilingAddOnSlugs(filing.id);
  const oa = filingHasOperatingAgreement({
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
    memberCount: filing.managersMembers.length,
  });

  if (!oa) {
    // Drop any percentages.
    for (const m of filing.managersMembers) {
      if (m.ownershipPercentage != null) {
        await prisma.managerMember.update({
          where: { id: m.id },
          data: { ownershipPercentage: null },
        });
      }
    }
    return;
  }

  // Single-member auto-fill.
  if (filing.managersMembers.length === 1) {
    const sole = filing.managersMembers[0];
    if (sole.ownershipPercentage == null) {
      await prisma.managerMember.update({
        where: { id: sole.id },
        data: { ownershipPercentage: 100 },
      });
    }
  }
}

// ─── Helper to read filing for wizard pages ───────────────────────────

export async function getWizardFiling(filingId: string) {
  const session = await auth();
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  if (!actor) redirect('/sign-in');
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      managersMembers: { orderBy: { position: 'asc' } },
      filingAdditionalServices: { include: { service: true } },
    },
  });
  // Guests cannot navigate to /dashboard; we send them home instead.
  if (!filing || filing.userId !== actor.id) {
    redirect(actor.kind === 'guest' ? '/' : '/dashboard');
  }
  return filing;
}
