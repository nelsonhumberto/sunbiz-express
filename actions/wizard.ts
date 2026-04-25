'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import {
  validateBusinessName,
  validateRegisteredAgentAddress,
  validateGeneralAddress,
} from '@/lib/florida';
import { safeParseJson } from '@/lib/utils';

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
      stateFeeCents: breakdown.stateSubtotalCents,
      serviceFeeCents:
        breakdown.lines
          .filter((l) => l.category === 'service')
          .reduce((sum, l) => sum + l.cents, 0),
      addOnsTotalCents: breakdown.lines
        .filter((l) => l.category === 'addon')
        .reduce((sum, l) => sum + l.cents, 0),
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

const MemberSchema = z.object({
  title: z.enum(['MGR', 'MGRM', 'AMBR', 'AP', 'OFFICER', 'DIRECTOR']),
  name: z.string().min(1).max(255),
  street1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
});

export async function saveStep7(input: {
  filingId: string;
  members: z.infer<typeof MemberSchema>[];
}) {
  const members = z.array(MemberSchema).min(1).parse(input.members);
  const { filing } = await getFilingForUser(input.filingId);

  // Replace all
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

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      currentStep: Math.max(filing.currentStep, 8),
      completedSteps: markStepComplete(filing.completedSteps, 7),
    },
  });
  return { ok: true };
}

// ─── Step 8: Correspondence ────────────────────────────────────────────

const Step8Schema = z.object({
  filingId: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
});

export async function saveStep8(input: z.infer<typeof Step8Schema>) {
  const data = Step8Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      correspondenceContact: JSON.stringify({ email: data.email, phone: data.phone }),
      currentStep: Math.max(filing.currentStep, 9),
      completedSteps: markStepComplete(filing.completedSteps, 8),
    },
  });
  return { ok: true };
}

// ─── Step 9: Optional details ──────────────────────────────────────────

const Step9Schema = z.object({
  filingId: z.string(),
  effectiveDate: z.string().optional(),
  authorizedShares: z.number().int().min(1).optional(),
  professionalPurpose: z.string().optional(),
  businessPurpose: z.string().optional(),
});

export async function saveStep9(
  input: z.infer<typeof Step9Schema>
): Promise<{ ok: boolean; error?: string }> {
  const data = Step9Schema.parse(input);
  const { filing } = await getFilingForUser(data.filingId);
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      optionalDetails: JSON.stringify({
        effectiveDate: data.effectiveDate || undefined,
        authorizedShares: data.authorizedShares,
        professionalPurpose: data.professionalPurpose || undefined,
        businessPurpose: data.businessPurpose || undefined,
      }),
      currentStep: Math.max(filing.currentStep, 10),
      completedSteps: markStepComplete(filing.completedSteps, 9),
    },
  });
  return { ok: true };
}

// ─── Step 10: Review & sign ────────────────────────────────────────────

const Step10Schema = z.object({
  filingId: z.string(),
  signature: z.string().min(2).max(255),
  confirmAccurate: z.boolean(),
});

export async function saveStep10(input: z.infer<typeof Step10Schema>) {
  const data = Step10Schema.parse(input);
  if (!data.confirmAccurate) return { ok: false, error: 'You must confirm the information is accurate.' };
  const { filing } = await getFilingForUser(data.filingId);
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      incorporatorSignature: data.signature,
      incorporatorSignedAt: new Date(),
      confirmationAccepted: true,
      currentStep: Math.max(filing.currentStep, 11),
      completedSteps: markStepComplete(filing.completedSteps, 10),
    },
  });
  return { ok: true };
}

// ─── Step 11: Add-ons ───────────────────────────────────────────────────

export async function saveStep11(input: { filingId: string; addOnSlugs: string[] }) {
  const { filing } = await getFilingForUser(input.filingId);

  // Lookup service ids
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
      currentStep: Math.max(filing.currentStep, 12),
      completedSteps: markStepComplete(filing.completedSteps, 11),
    },
  });
  await recomputeCost(filing.id);
  return { ok: true };
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
