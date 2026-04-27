'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
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
} from '@/lib/florida';
import { safeParseJson } from '@/lib/utils';

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
  if (!session?.user?.id) redirect('/sign-in');
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { managersMembers: { orderBy: { position: 'asc' } } },
  });
  if (!filing || filing.userId !== session.user.id) {
    throw new Error('Filing not found');
  }
  return { filing, session };
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
  const breakdown = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });
  await prisma.filing.update({
    where: { id: filingId },
    data: {
      // Customer-facing pricing is presented as a single all-in package; the
      // DB columns now act as the internal accounting ledger:
      //   stateFeeCents     = total amount we forward to Florida
      //   serviceFeeCents   = IncServices margin baked into the package
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
});

export async function saveStep1(input: z.infer<typeof Step1Schema>) {
  const data = Step1Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      entityType: data.entityType,
      currentStep: Math.max(filing.currentStep, 2),
      completedSteps: markStepComplete(filing.completedSteps, 1),
    },
  });
  await recomputeCost(filing.id);
  revalidatePath(`/wizard/${filing.id}`);
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

  const validation = validateBusinessName(data.businessName, filing.entityType as 'LLC' | 'CORP');
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
    const v = validateRegisteredAgentAddress({
      street1: data.street1,
      street2: data.street2 ?? undefined,
      city: data.city,
      state: data.state,
      zip: data.zip,
    });
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
  title: z.enum(['MGR', 'MGRM', 'AMBR', 'AP', 'OFFICER', 'DIRECTOR']),
  name: z.string().min(1).max(255),
  street1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
});

const Step7Schema = z.object({
  filingId: z.string(),
  managementType: ManagementTypeSchema,
  members: z.array(MemberSchema).min(1),
});

export async function saveStep7(input: z.infer<typeof Step7Schema>) {
  const data = Step7Schema.parse(input);
  const { filing, session } = await getFilingForUser(data.filingId);

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

  await prisma.managerMember.deleteMany({ where: { filingId: filing.id } });
  await prisma.managerMember.createMany({
    data: members.map((m, idx) => ({
      filingId: filing.id,
      title: m.title,
      name: m.name,
      street1: m.street1,
      city: m.city,
      state: m.state,
      zip: m.zip,
      ownershipPercentage: m.ownershipPercentage,
      position: idx,
    })),
  });

  await persistManagementType(filing.id, filing.optionalDetails, data.managementType, entityType);

  // Auto-populate correspondence contact from the authenticated user's email,
  // since the standalone correspondence step was removed.
  await ensureCorrespondenceFromSession(
    filing.id,
    filing.correspondenceContact,
    session.user?.email,
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

const Step9Schema = z.object({
  filingId: z.string(),
  effectiveDate: z.string().optional(),
  authorizedShares: z.number().int().min(1).optional(),
  professionalPurpose: z.string().optional(),
  businessPurpose: z.string().optional(),
});

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
    const v = isValidEffectiveDate(parsed);
    if (!v.valid) return { ok: false, error: v.error };
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
        professionalPurpose: data.professionalPurpose || undefined,
        businessPurpose: data.businessPurpose || undefined,
      }),
      currentStep: Math.max(filing.currentStep, 9),
      completedSteps: markStepComplete(filing.completedSteps, 8),
    },
  });
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
  const { filing, session } = await getFilingForUser(data.filingId);

  // Final safety net: ensure the correspondence email is populated before
  // the filing can be signed (covers any drafts that skipped step 7 logic).
  await ensureCorrespondenceFromSession(
    filing.id,
    filing.correspondenceContact,
    session.user?.email,
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
  if (!session?.user?.id) redirect('/sign-in');
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      managersMembers: { orderBy: { position: 'asc' } },
      filingAdditionalServices: { include: { service: true } },
    },
  });
  if (!filing || filing.userId !== session.user.id) redirect('/dashboard');
  return filing;
}
