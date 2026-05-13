'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWizardActor } from '@/lib/guest';
import { encryptString, decryptString } from '@/lib/encryption';
import {
  classifyEinPathway,
  filingIncludesEin,
  lastFourDigits,
  looksLikeUsTaxId,
} from '@/lib/ein';
import type { AddOnSlug, TierSlug } from '@/lib/pricing';

// We never accept SSN/ITIN values shorter than 9 digits. UI must surface the
// validation error; this is the server-side defence in depth.
const SsnLikeSchema = z.string().refine(looksLikeUsTaxId, {
  message: 'SSN/ITIN must be exactly 9 digits.',
});

const UsResponsiblePartySchema = z.object({
  responsiblePartyType: z.literal('us'),
  legalName: z.string().min(1).max(255),
  title: z.string().min(1).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email(),
  taxIdType: z.enum(['SSN', 'ITIN', 'EIN']),
  taxId: SsnLikeSchema,
  consentToFile: z.literal(true, {
    errorMap: () => ({ message: 'You must authorize LaunchForma to file Form SS-4.' }),
  }),
});

const ForeignResponsiblePartySchema = z.object({
  responsiblePartyType: z.literal('foreign'),
  legalName: z.string().min(1).max(255),
  title: z.string().min(1).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email(),
  countryOfCitizenship: z.string().min(2).max(80),
  passportCountry: z.string().min(2).max(80),
  passportNumber: z.string().min(3).max(40),
  identityVerificationConsent: z.literal(true, {
    errorMap: () => ({
      message:
        'You must consent to identity verification (foreign applicants cannot use the IRS online EIN Assistant).',
    }),
  }),
  consentToFile: z.literal(true, {
    errorMap: () => ({ message: 'You must authorize LaunchForma to file Form SS-4.' }),
  }),
});

const SaveEinSchema = z
  .object({ filingId: z.string().min(1) })
  .and(z.union([UsResponsiblePartySchema, ForeignResponsiblePartySchema]));

async function getFilingForUser(filingId: string) {
  const session = await auth();
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  if (!actor) redirect('/sign-in');
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
    },
  });
  if (!filing || filing.userId !== actor.id) {
    throw new Error('Filing not found');
  }
  return filing;
}

/**
 * Persist the EIN responsible-party data. Sensitive fields are encrypted
 * with `lib/encryption.ts`; the unencrypted DB row only retains a 4-digit
 * tail for admin/customer display.
 */
export async function saveEinResponsibleParty(
  input: z.infer<typeof SaveEinSchema>,
): Promise<{ ok: boolean; error?: string; status?: 'ready_online' | 'manual_foreign' }> {
  const data = SaveEinSchema.parse(input);
  const filing = await getFilingForUser(data.filingId);

  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  if (
    !filingIncludesEin({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs,
    })
  ) {
    return {
      ok: false,
      error: 'EIN is not included in this package — add it from Step 10 first.',
    };
  }

  const status = classifyEinPathway({
    responsiblePartyType: data.responsiblePartyType,
    taxIdType: 'taxIdType' in data ? data.taxIdType : null,
  });

  // Build the encrypted payload server-side. Plaintext PII never leaves
  // this scope — only ciphertext + last-4 hits Postgres.
  const baseFields = {
    filingId: filing.id,
    responsiblePartyType: data.responsiblePartyType,
    legalName: data.legalName.trim(),
    title: data.title.trim(),
    phone: data.phone.trim(),
    email: data.email.trim().toLowerCase(),
    consentToFile: data.consentToFile,
    consentToShare: true, // implicit by submitting the wizard form
    status,
  };

  if (data.responsiblePartyType === 'us') {
    const last4 = lastFourDigits(data.taxId);
    const encrypted = encryptString(data.taxId.replace(/\D/g, ''));
    await prisma.einApplication.upsert({
      where: { filingId: filing.id },
      create: {
        ...baseFields,
        taxIdType: data.taxIdType,
        taxIdEncrypted: encrypted,
        taxIdLast4: last4,
        countryOfCitizenship: null,
        passportCountry: null,
        passportEncrypted: null,
        passportLast4: null,
        identityVerificationConsent: false,
      },
      update: {
        ...baseFields,
        taxIdType: data.taxIdType,
        taxIdEncrypted: encrypted,
        taxIdLast4: last4,
        countryOfCitizenship: null,
        passportCountry: null,
        passportEncrypted: null,
        passportLast4: null,
        identityVerificationConsent: false,
      },
    });
  } else {
    const last4 = data.passportNumber.trim().slice(-4);
    const encrypted = encryptString(data.passportNumber.trim());
    await prisma.einApplication.upsert({
      where: { filingId: filing.id },
      create: {
        ...baseFields,
        taxIdType: null,
        taxIdEncrypted: null,
        taxIdLast4: null,
        countryOfCitizenship: data.countryOfCitizenship.trim(),
        passportCountry: data.passportCountry.trim(),
        passportEncrypted: encrypted,
        passportLast4: last4,
        identityVerificationConsent: data.identityVerificationConsent,
      },
      update: {
        ...baseFields,
        taxIdType: null,
        taxIdEncrypted: null,
        taxIdLast4: null,
        countryOfCitizenship: data.countryOfCitizenship.trim(),
        passportCountry: data.passportCountry.trim(),
        passportEncrypted: encrypted,
        passportLast4: last4,
        identityVerificationConsent: data.identityVerificationConsent,
      },
    });
  }

  revalidatePath(`/wizard/${filing.id}/11`);
  revalidatePath(`/dashboard/filings/${filing.id}`);
  return { ok: true, status };
}

/**
 * Public summary for the wizard payment gate. Does NOT include any
 * encrypted data — only labels and last-4s safe for client display.
 */
export async function getEinSummary(
  filingId: string,
): Promise<
  | { complete: false; required: boolean }
  | {
      complete: true;
      required: true;
      status: 'ready_online' | 'manual_foreign' | 'submitted' | 'delivered';
      legalName: string;
      responsiblePartyType: 'us' | 'foreign';
      taxIdLast4?: string | null;
      passportLast4?: string | null;
      countryOfCitizenship?: string | null;
    }
> {
  const filing = await getFilingForUser(filingId);
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const required = filingIncludesEin({
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });
  if (!required) return { complete: false, required: false };
  const ein = filing.einApplication;
  if (!ein || (ein.status !== 'ready_online' && ein.status !== 'manual_foreign' && ein.status !== 'submitted' && ein.status !== 'delivered')) {
    return { complete: false, required: true };
  }
  return {
    complete: true,
    required: true,
    status: ein.status as 'ready_online' | 'manual_foreign' | 'submitted' | 'delivered',
    legalName: ein.legalName ?? '',
    responsiblePartyType: ein.responsiblePartyType as 'us' | 'foreign',
    taxIdLast4: ein.taxIdLast4,
    passportLast4: ein.passportLast4,
    countryOfCitizenship: ein.countryOfCitizenship,
  };
}

/**
 * Admin-only helper: decrypt the responsible-party tax id / passport. Rejects
 * non-admin callers. Used for IRS Form SS-4 preparation.
 */
export async function adminRevealEinSecret(
  filingId: string,
): Promise<{ ok: true; taxId?: string; passport?: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Not authenticated' };
  if (session.user.role !== 'ADMIN') return { ok: false, error: 'Forbidden' };
  const ein = await prisma.einApplication.findUnique({ where: { filingId } });
  if (!ein) return { ok: false, error: 'No EIN application' };
  return {
    ok: true,
    taxId: ein.taxIdEncrypted ? decryptString(ein.taxIdEncrypted) : undefined,
    passport: ein.passportEncrypted ? decryptString(ein.passportEncrypted) : undefined,
  };
}
