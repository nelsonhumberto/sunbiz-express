'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeNextAnnualReport, FL } from '@/lib/florida';
import { sendEmail } from '@/lib/email-mock';
import {
  fetchFloridaEntityDetailByDocumentNumber,
  normalizeFloridaDocumentNumber,
  SunbizError,
  type FloridaEntityDetail,
} from '@/lib/sunbiz';

const PreviewSchema = z.object({
  documentNumber: z.string().min(5).max(24).trim(),
  legalNameHint: z.string().max(300).optional(),
});

const ConfirmSchema = z.object({
  documentNumber: z.string().min(5).max(24).trim(),
  legalNameHint: z.string().max(300).optional(),
});

const ManualConfirmSchema = z.object({
  documentNumber: z.string().min(5).max(24).trim(),
  companyName: z.string().min(2).max(200).trim(),
  entityType: z.enum(['LLC', 'CORP']),
});

function inferEntityType(d: FloridaEntityDetail): 'LLC' | 'CORP' {
  const label = `${d.filing_type_display ?? ''} ${d.filing_type ?? ''}`.toUpperCase();
  if (
    label.includes('LIMITED LIABILITY') ||
    label.includes('LLC') ||
    label.includes('L.L.C') ||
    label.includes('FLAL')
  ) {
    return 'LLC';
  }
  return 'CORP';
}

function principalJson(d: FloridaEntityDetail): string | null {
  const a = d.principal_address;
  if (!a?.address_1 && !a?.city) return null;
  return JSON.stringify({
    street1: a.address_1 ?? '',
    street2: a.address_2 || undefined,
    city: a.city ?? '',
    state: a.state ?? 'FL',
    zip: a.zip ?? '',
  });
}

function mailingJson(d: FloridaEntityDetail): string | null {
  const a = d.mailing_address;
  if (!a?.address_1 && !a?.city) return null;
  return JSON.stringify({
    street1: a.address_1 ?? '',
    street2: a.address_2 || undefined,
    city: a.city ?? '',
    state: a.state ?? 'FL',
    zip: a.zip ?? '',
  });
}

function registeredAgentJson(d: FloridaEntityDetail): string | null {
  const ra = d.registered_agent;
  if (!ra?.name) return null;
  const addr = ra.address;
  return JSON.stringify({
    type: 'third_party',
    name: ra.name,
    street1: addr?.address_1 ?? '',
    street2: addr?.address_2 || undefined,
    city: addr?.city ?? '',
    state: addr?.state ?? '',
    zip: addr?.zip ?? '',
    useOurService: false,
    agentCountry: addr?.country ?? 'US',
  });
}

function mapOfficerTitle(title?: string): string {
  const u = (title ?? '').toUpperCase();
  if (u.includes('MGR')) return 'MGR';
  if (u.includes('MGRM')) return 'MGRM';
  if (u.includes('AMBR')) return 'AMBR';
  if (u.includes('DIRECTOR')) return 'DIRECTOR';
  if (u.includes('OFFICER')) return 'OFFICER';
  if (u.includes('PRES')) return 'OFFICER';
  if (u.includes('SEC')) return 'OFFICER';
  return 'MGR';
}

function formationDate(d: FloridaEntityDetail): Date {
  if (!d.file_date) return new Date();
  const dt = new Date(`${d.file_date}T12:00:00.000Z`);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

/** Resolve the real DB user record — tries by id first, then falls back to email. */
async function resolveUser(
  sessionId: string,
  sessionEmail: string | null | undefined,
): Promise<{ id: string; email: string; phone: string | null } | null> {
  // Primary: look up by the id in the JWT
  const byId = await prisma.user.findUnique({
    where: { id: sessionId },
    select: { id: true, email: true, phone: true },
  });
  if (byId) return byId;

  // Fallback: the JWT id may be stale (e.g. after a DB reset). Use email.
  if (!sessionEmail) return null;
  return prisma.user.findUnique({
    where: { email: sessionEmail.toLowerCase().trim() },
    select: { id: true, email: true, phone: true },
  });
}

export async function previewLinkedEntity(input: z.infer<typeof PreviewSchema>) {
  const data = PreviewSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Sign in to look up your entity.' };
  }

  try {
    const detail = await fetchFloridaEntityDetailByDocumentNumber(data.documentNumber, {
      legalNameHint: data.legalNameHint?.trim() || undefined,
    });
    const raCountry = detail.registered_agent?.address?.country ?? 'US';
    return {
      ok: true as const,
      detail: {
        documentNumber: detail.corporation_number,
        name: detail.corporation_name,
        entityType: inferEntityType(detail),
        status: detail.status,
        fileDate: detail.file_date,
        principalCity: detail.principal_address?.city ?? null,
        principalState: detail.principal_address?.state ?? null,
        registeredAgentName: detail.registered_agent?.name ?? null,
        registeredAgentCountry: raCountry,
        suggestRaUpsell: raCountry !== 'US',
      },
    };
  } catch (err) {
    if (err instanceof SunbizError) {
      return { ok: false as const, error: err.message };
    }
    return { ok: false as const, error: 'We could not load that entity. Try again.' };
  }
}

export async function confirmLinkedEntity(input: z.infer<typeof ConfirmSchema>) {
  const data = ConfirmSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Sign in to add your company.' };
  }

  const docNorm = normalizeFloridaDocumentNumber(data.documentNumber);

  let detail: FloridaEntityDetail;
  try {
    detail = await fetchFloridaEntityDetailByDocumentNumber(docNorm, {
      legalNameHint: data.legalNameHint?.trim() || undefined,
    });
  } catch (err) {
    if (err instanceof SunbizError) {
      return { ok: false as const, error: err.message };
    }
    return { ok: false as const, error: 'Lookup failed. Try again.' };
  }

  if (normalizeFloridaDocumentNumber(detail.corporation_number) !== docNorm) {
    return { ok: false as const, error: 'Document number mismatch. Refresh and try again.' };
  }

  const entityType = inferEntityType(detail);
  const user = await resolveUser(session.user.id, session.user.email);
  if (!user) {
    return { ok: false as const, error: 'Account not found — please sign out and back in.' };
  }

  const principal = principalJson(detail);
  const mailing = mailingJson(detail);
  const regAgent = registeredAgentJson(detail);
  const formed = formationDate(detail);
  const nextAr = computeNextAnnualReport(formed);
  const officers = (detail.officers ?? []).slice(0, 12);

  try {
    const filingId = await prisma.$transaction(async (tx) => {
      const filing = await tx.filing.create({
        data: {
          userId: user.id,
          filingSource: 'LINKED',
          entityType,
          state: 'FL',
          serviceTier: 'STANDARD',
          businessName: detail.corporation_name,
          nameAvailable: true,
          nameCheckedAt: new Date(),
          principalAddress: principal,
          mailingAddress: mailing ?? undefined,
          registeredAgent: regAgent,
          correspondenceContact: JSON.stringify({
            email: user.email,
            phone: user.phone ?? undefined,
          }),
          confirmationAccepted: true,
          status: 'APPROVED',
          currentStep: 12,
          completedSteps: JSON.stringify(Array.from({ length: 12 }, (_, i) => i + 1)),
          sunbizFilingNumber: docNorm,
          sunbizApprovedAt: new Date(),
          submittedAt: new Date(),
          linkedEntitySnapshot: JSON.stringify(detail),
          stateFeeCents: 0,
          serviceFeeCents: 0,
          addOnsTotalCents: 0,
          totalCents: 0,
        },
      });

      if (officers.length > 0) {
        await tx.managerMember.createMany({
          data: officers.map((o, position) => ({
            filingId: filing.id,
            title: mapOfficerTitle(o.title),
            name: (o.name ?? '').trim() || 'Authorized representative',
            position,
          })),
        });
      }

      await tx.annualReport.create({
        data: {
          filingId: filing.id,
          reportYear: nextAr.reportYear,
          dueDate: nextAr.dueDate,
          filingFeeCents:
            entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp,
          totalCostCents:
            entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp,
          status: 'PENDING',
        },
      });

      return filing.id;
    });

    await sendEmail({
      type: 'PAYMENT_CONFIRMATION',
      to: user.email,
      userId: user.id,
      filingId,
      context: {
        businessName: detail.corporation_name,
        totalCents: 0,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/compliance');
    return { ok: true as const, filingId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return {
        ok: false as const,
        error: 'This document number is already linked to an IncServices account.',
      };
    }
    throw e;
  }
}

export async function manualConfirmLinkedEntity(input: z.infer<typeof ManualConfirmSchema>) {
  const data = ManualConfirmSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Sign in to add your company.' };
  }

  const docNorm = normalizeFloridaDocumentNumber(data.documentNumber);
  const user = await resolveUser(session.user.id, session.user.email);
  if (!user) {
    return { ok: false as const, error: 'Account not found — please sign out and back in.' };
  }

  const nextAr = computeNextAnnualReport(new Date());

  try {
    const filingId = await prisma.$transaction(async (tx) => {
      const filing = await tx.filing.create({
        data: {
          userId: user.id,
          filingSource: 'LINKED',
          entityType: data.entityType,
          state: 'FL',
          serviceTier: 'STANDARD',
          businessName: data.companyName,
          nameAvailable: true,
          nameCheckedAt: new Date(),
          correspondenceContact: JSON.stringify({
            email: user.email,
            phone: user.phone ?? undefined,
          }),
          confirmationAccepted: true,
          // SUBMITTED = user-provided data, awaiting admin spot-check
          status: 'SUBMITTED',
          currentStep: 12,
          completedSteps: JSON.stringify(Array.from({ length: 12 }, (_, i) => i + 1)),
          sunbizFilingNumber: docNorm,
          submittedAt: new Date(),
          stateFeeCents: 0,
          serviceFeeCents: 0,
          addOnsTotalCents: 0,
          totalCents: 0,
        },
      });

      await tx.annualReport.create({
        data: {
          filingId: filing.id,
          reportYear: nextAr.reportYear,
          dueDate: nextAr.dueDate,
          filingFeeCents:
            data.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp,
          totalCostCents:
            data.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp,
          status: 'PENDING',
        },
      });

      return filing.id;
    });

    await sendEmail({
      type: 'PAYMENT_CONFIRMATION',
      to: user.email,
      userId: user.id,
      filingId,
      context: {
        businessName: data.companyName,
        totalCents: 0,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/compliance');
    return { ok: true as const, filingId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return {
        ok: false as const,
        error: 'This document number is already linked to an IncServices account.',
      };
    }
    throw e;
  }
}
