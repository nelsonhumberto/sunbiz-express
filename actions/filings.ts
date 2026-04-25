'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email-mock';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import {
  generateArticlesOfOrganization,
  generateArticlesOfIncorporation,
  generateOperatingAgreement,
  generateReceipt,
  encodeDocument,
} from '@/lib/pdf';
import {
  generateTrackingNumber,
  generatePin,
  generateSunbizFilingNumber,
  safeParseJson,
} from '@/lib/utils';
import { computeNextAnnualReport, FL } from '@/lib/florida';

export async function createFiling(input?: { entityType?: 'LLC' | 'CORP'; tier?: TierSlug }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const filing = await prisma.filing.create({
    data: {
      userId: session.user.id,
      entityType: input?.entityType ?? 'LLC',
      state: 'FL',
      serviceTier: input?.tier ?? 'STANDARD',
      currentStep: 1,
    },
  });

  await sendEmail({
    type: 'FILING_STARTED',
    to: session.user.email!,
    userId: session.user.id,
    filingId: filing.id,
  });

  redirect(`/wizard/${filing.id}/1`);
}

export async function deleteDraftFiling(filingId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const filing = await prisma.filing.findUnique({ where: { id: filingId } });
  if (!filing || filing.userId !== session.user.id) throw new Error('Not found');
  if (filing.status !== 'DRAFT') throw new Error('Cannot delete a submitted filing.');
  await prisma.filing.delete({ where: { id: filingId } });
  revalidatePath('/dashboard');
}

// ─── Submit & "file" with state (mock) ────────────────────────────────────

export async function submitFilingToState(filingId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { managersMembers: true, payments: true },
  });
  if (!filing || filing.userId !== session.user.id) throw new Error('Not found');

  const trackingNumber = generateTrackingNumber();
  const pin = generatePin();
  const filingNumber = generateSunbizFilingNumber(filing.entityType as 'LLC' | 'CORP');
  const submittedAt = new Date();

  // Generate documents
  const filingForDoc = {
    id: filing.id,
    businessName: filing.businessName ?? '',
    entityType: filing.entityType as 'LLC' | 'CORP',
    principalAddress: safeParseJson(filing.principalAddress, null),
    mailingAddress: safeParseJson<unknown>(filing.mailingAddress, null) as
      | string
      | { street1: string; street2?: string; city: string; state: string; zip: string }
      | null,
    registeredAgent: safeParseJson(filing.registeredAgent, null),
    correspondenceContact: safeParseJson(filing.correspondenceContact, null),
    optionalDetails: safeParseJson(filing.optionalDetails, null),
    incorporatorSignature: filing.incorporatorSignature,
    incorporatorSignedAt: filing.incorporatorSignedAt,
    sunbizFilingNumber: filingNumber,
    submittedAt,
    managersMembers: filing.managersMembers,
  };

  const articles =
    filing.entityType === 'LLC'
      ? generateArticlesOfOrganization(filingForDoc as Parameters<typeof generateArticlesOfOrganization>[0])
      : generateArticlesOfIncorporation(filingForDoc as Parameters<typeof generateArticlesOfIncorporation>[0]);

  const operatingAgreement = generateOperatingAgreement(
    filingForDoc as Parameters<typeof generateOperatingAgreement>[0]
  );

  const payment = filing.payments.find((p) => p.status === 'SUCCEEDED');
  const lines: { label: string; cents: number }[] = [
    { label: `Florida ${filing.entityType} state filing fee`, cents: filing.stateFeeCents },
  ];
  if (filing.serviceFeeCents > 0)
    lines.push({ label: 'Formation service fee', cents: filing.serviceFeeCents });
  if (filing.addOnsTotalCents > 0)
    lines.push({ label: 'Add-on services', cents: filing.addOnsTotalCents });

  const receipt = generateReceipt({
    filingId: filing.id,
    businessName: filing.businessName ?? '',
    totalCents: filing.totalCents,
    lines,
    paidAt: payment?.completedAt ?? submittedAt,
    cardLast4: payment?.cardLast4 ?? undefined,
  });

  await prisma.document.createMany({
    data: [
      {
        filingId: filing.id,
        documentType: filing.entityType === 'LLC' ? 'ARTICLES_ORG' : 'ARTICLES_INC',
        title: filing.entityType === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation',
        base64: encodeDocument(articles),
        mimeType: 'text/html',
        fileSizeBytes: articles.length,
      },
      {
        filingId: filing.id,
        documentType: 'OPERATING_AGREEMENT',
        title: 'Operating Agreement',
        base64: encodeDocument(operatingAgreement),
        mimeType: 'text/html',
        fileSizeBytes: operatingAgreement.length,
      },
      {
        filingId: filing.id,
        documentType: 'RECEIPT',
        title: 'Filing Receipt',
        base64: encodeDocument(receipt),
        mimeType: 'text/html',
        fileSizeBytes: receipt.length,
      },
    ],
  });

  // RA service record (if internal)
  const ra = safeParseJson<{
    type: string;
    name: string;
    email?: string;
    phone?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    useOurService?: boolean;
  } | null>(filing.registeredAgent, null);
  if (ra && ra.useOurService) {
    await prisma.registeredAgentService.create({
      data: {
        filingId: filing.id,
        serviceProvider: 'INTERNAL',
        agentName: ra.name,
        agentEmail: ra.email,
        agentPhone: ra.phone,
        street1: ra.street1,
        street2: ra.street2,
        city: ra.city,
        state: ra.state,
        zip: ra.zip,
        startDate: submittedAt,
        renewalDate: new Date(submittedAt.getFullYear() + 1, submittedAt.getMonth(), submittedAt.getDate()),
        status: 'ACTIVE',
      },
    });
  }

  // Annual report record
  const next = computeNextAnnualReport(submittedAt);
  await prisma.annualReport.create({
    data: {
      filingId: filing.id,
      reportYear: next.reportYear,
      dueDate: next.dueDate,
      filingFeeCents:
        filing.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp,
      totalCostCents:
        filing.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp,
      status: 'PENDING',
    },
  });

  await prisma.filing.update({
    where: { id: filingId },
    data: {
      status: 'SUBMITTED',
      sunbizFilingNumber: filingNumber,
      sunbizTrackingNumber: trackingNumber,
      sunbizPin: pin,
      sunbizSubmittedAt: submittedAt,
      submittedAt,
    },
  });

  await sendEmail({
    type: 'FILING_SUBMITTED',
    to: session.user.email!,
    userId: session.user.id,
    filingId: filing.id,
    context: {
      businessName: filing.businessName ?? '',
      trackingNumber,
      pin,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/filings/${filingId}`);
}
