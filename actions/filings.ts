'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  computeCost,
  filingHasOperatingAgreement,
  tierBundledAddOns,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import {
  generateArticlesOfOrganization,
  generateArticlesOfIncorporation,
  generateOperatingAgreement,
  generateReceipt,
  generateCoverLetter,
  encodeDocument,
} from '@/lib/pdf';
import {
  generateTrackingNumber,
  generatePin,
  safeParseJson,
} from '@/lib/utils';
import {
  ACTIVE_FORMATION_STATES,
  annualComplianceFor,
  defaultProcessingOption,
  getFormationState,
  resolveProcessingOption,
  type StateCode,
} from '@/lib/formation-states';
import { computeNextAnnualCompliance } from '@/lib/formation-validation';
import { getWizardActor } from '@/lib/guest';
import { filingUtmCreateFields } from '@/lib/utm-attribution';

export async function createFiling(input?: {
  entityType?: 'LLC' | 'CORP';
  tier?: TierSlug;
  /** USPS code of the state to file in. Defaults to FL. */
  state?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const requestedState = (input?.state ?? 'FL').toUpperCase();
  const stateCode: StateCode = ACTIVE_FORMATION_STATES.includes(
    requestedState as StateCode,
  )
    ? (requestedState as StateCode)
    : 'FL';

  const filing = await prisma.filing.create({
    data: {
      userId: session.user.id,
      entityType: input?.entityType ?? 'LLC',
      state: stateCode,
      serviceTier: input?.tier ?? 'STANDARD',
      currentStep: 1,
      ...filingUtmCreateFields(),
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
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  if (!actor) redirect('/sign-in');

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      managersMembers: true,
      payments: true,
      filingAdditionalServices: { include: { service: true } },
    },
  });
  if (!filing || filing.userId !== actor.id) throw new Error('Not found');

  const trackingNumber = generateTrackingNumber();
  const pin = generatePin();
  const submittedAt = new Date();

  // Generate documents.
  //
  // IMPORTANT: We do NOT assign a Sunbiz filing number at submit time. The
  // real filing number is issued by Florida and entered by an admin once
  // the state approves the filing. The Articles render a "Submitted —
  // awaiting approval" badge until then.
  const filingForDoc = {
    id: filing.id,
    businessName: filing.businessName ?? '',
    entityType: filing.entityType as 'LLC' | 'CORP',
    state: filing.state,
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
    sunbizFilingNumber: null as string | null,
    sunbizApprovedAt: null as Date | null,
    submittedAt,
    managersMembers: filing.managersMembers,
  };

  const articles =
    filing.entityType === 'LLC'
      ? generateArticlesOfOrganization(filingForDoc as Parameters<typeof generateArticlesOfOrganization>[0])
      : generateArticlesOfIncorporation(filingForDoc as Parameters<typeof generateArticlesOfIncorporation>[0]);

  // Only generate the Operating Agreement when the filing's tier or add-ons
  // entitle the customer to one. This prevents Starter (BASIC) tier users
  // from getting a paid document for free.
  const filingAddOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const oaEntitled =
    filing.entityType === 'LLC' &&
    filingHasOperatingAgreement({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs: filingAddOnSlugs,
      memberCount: filing.managersMembers.length,
    });
  const operatingAgreement = oaEntitled
    ? generateOperatingAgreement(
        filingForDoc as Parameters<typeof generateOperatingAgreement>[0],
      )
    : null;

  // Customer receipts present the all-in pricing the customer actually paid
  // (filing package + add-ons), not the internal state-vs-margin split. We
  // reconstruct the lines directly from `computeCost` so the receipt always
  // matches what the wizard cost sidebar showed.
  const filingStateCode: StateCode = ACTIVE_FORMATION_STATES.includes(
    filing.state.toUpperCase() as StateCode,
  )
    ? (filing.state.toUpperCase() as StateCode)
    : 'FL';
  const stateRule = getFormationState(filingStateCode);
  const optionalForCost = safeParseJson<Record<string, unknown> | null>(
    filing.optionalDetails,
    null,
  );
  const processingOptionId =
    optionalForCost && typeof optionalForCost.processingOption === 'string'
      ? (optionalForCost.processingOption as string)
      : undefined;
  const breakdownForReceipt = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs: filingAddOnSlugs,
    state: filingStateCode,
    processingOptionId,
  });
  const payment = filing.payments.find((p) => p.status === 'SUCCEEDED');
  const receipt = generateReceipt({
    filingId: filing.id,
    businessName: filing.businessName ?? '',
    totalCents: filing.totalCents,
    lines: breakdownForReceipt.lines.map((l) => ({ label: l.label, cents: l.cents })),
    paidAt: payment?.completedAt ?? submittedAt,
    cardLast4: payment?.cardLast4 ?? undefined,
    state: filingStateCode,
  });

  // Cover letter — admin-only, mirrors the cover sheet on CR2E047. Customer
  // dashboards filter this out via documentType !== 'COVER_LETTER'.
  const correspondence = safeParseJson<{ email?: string; phone?: string } | null>(
    filing.correspondenceContact,
    null,
  );
  // Bundled add-ons (Standard/Premium tiers include cert_status, cert_copy,
  // and ein) entitle the customer to those documents too — so we still want
  // pending placeholders even if the customer didn't pick them à la carte.
  const allEntitledAddOns: AddOnSlug[] = [
    ...new Set<AddOnSlug>([
      ...filingAddOnSlugs,
      ...tierBundledAddOns(filing.serviceTier as TierSlug),
    ]),
  ];
  const wantsCertStatus = allEntitledAddOns.includes('cert_status');
  const wantsCertCopy = allEntitledAddOns.includes('cert_copy');
  const wantsEin = allEntitledAddOns.includes('ein');
  // The cover letter goes to the Florida Department of State alongside the
  // money order / check. It MUST reflect the actual amount we are remitting
  // to Florida — never the customer's all-in package price (which includes
  // LaunchForma's margin and add-ons that are not paid to FL).
  // Resolve the chosen processing option so it lands on the cover letter
  // when expedited (matches what we'll actually pay the state).
  const chosenProcessing = resolveProcessingOption(filingStateCode, processingOptionId);
  const defaultProcessing = defaultProcessingOption(filingStateCode);
  const processingOptionForLetter =
    chosenProcessing.id !== defaultProcessing.id && chosenProcessing.feeCents > 0
      ? {
          label: chosenProcessing.label,
          estimate: chosenProcessing.estimate,
          feeCents: chosenProcessing.feeCents,
        }
      : null;
  const coverLetter = generateCoverLetter({
    filing: filingForDoc as Parameters<typeof generateCoverLetter>[0]['filing'],
    contactName: filing.incorporatorSignature ?? actor.email ?? 'Authorized Person',
    contactEmail: correspondence?.email ?? actor.email ?? '',
    contactPhone: correspondence?.phone ?? null,
    totalFeeCents: filing.stateFeeCents, // government remittance only
    certificateOfStatus: wantsCertStatus,
    certifiedCopy: wantsCertCopy,
    processingOption: processingOptionForLetter,
  });

  type DocRow = {
    filingId: string;
    documentType: string;
    title: string;
    base64: string;
    mimeType: string;
    fileSizeBytes: number;
    pendingState?: boolean;
  };

  const articlesTitle =
    filing.entityType === 'LLC'
      ? stateRule.documentLabels.llcArticles
      : stateRule.documentLabels.corpArticles;
  const documents: DocRow[] = [
    {
      filingId: filing.id,
      documentType: filing.entityType === 'LLC' ? 'ARTICLES_ORG' : 'ARTICLES_INC',
      title: articlesTitle,
      base64: encodeDocument(articles),
      mimeType: 'text/html',
      fileSizeBytes: articles.length,
    },
    {
      filingId: filing.id,
      documentType: 'COVER_LETTER',
      title: `${stateRule.documentLabels.coverLetter} (admin only)`,
      base64: encodeDocument(coverLetter),
      mimeType: 'text/html',
      fileSizeBytes: coverLetter.length,
    },
    {
      filingId: filing.id,
      documentType: 'RECEIPT',
      title: 'Filing Receipt',
      base64: encodeDocument(receipt),
      mimeType: 'text/html',
      fileSizeBytes: receipt.length,
    },
  ];

  if (operatingAgreement) {
    documents.push({
      filingId: filing.id,
      documentType: 'OPERATING_AGREEMENT',
      title: 'Operating Agreement',
      base64: encodeDocument(operatingAgreement),
      mimeType: 'text/html',
      fileSizeBytes: operatingAgreement.length,
    });
  }

  // Pending add-on placeholders: Cert of Status, Certified Copy, EIN Letter.
  // These appear on the customer dashboard as "Awaiting state issuance" until
  // an admin uploads the real PDF received from Florida or the IRS.
  if (wantsCertStatus) {
    documents.push({
      filingId: filing.id,
      documentType: 'CERT_STATUS',
      title: 'Certificate of Status',
      base64: '',
      mimeType: 'application/pdf',
      fileSizeBytes: 0,
      pendingState: true,
    });
  }
  if (wantsCertCopy) {
    documents.push({
      filingId: filing.id,
      documentType: 'CERT_COPY',
      title: 'Certified Copy of Articles',
      base64: '',
      mimeType: 'application/pdf',
      fileSizeBytes: 0,
      pendingState: true,
    });
  }
  if (wantsEin) {
    documents.push({
      filingId: filing.id,
      documentType: 'EIN_LETTER',
      title: 'EIN Confirmation Letter (CP 575)',
      base64: '',
      mimeType: 'application/pdf',
      fileSizeBytes: 0,
      pendingState: true,
    });
  }

  await prisma.document.createMany({ data: documents });

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

  // Annual report record. State-aware: FL files an Annual Report by May 1,
  // WY files on the first day of the anniversary month, DE LLCs pay an
  // Annual Tax by June 1, DE corps file an Annual Report + Franchise Tax by
  // March 1. The shared lookup yields the correct amount + due date and we
  // mirror it verbatim into the AnnualReport row.
  const compliance = annualComplianceFor(stateRule, filing.entityType as 'LLC' | 'CORP');
  const nextDeadline = computeNextAnnualCompliance(
    submittedAt,
    filingStateCode,
    filing.entityType as 'LLC' | 'CORP',
    submittedAt,
  );
  await prisma.annualReport.create({
    data: {
      filingId: filing.id,
      reportYear: nextDeadline.reportYear,
      dueDate: nextDeadline.dueDate,
      filingFeeCents: compliance.baseFeeCents,
      totalCostCents: compliance.baseFeeCents,
      status: 'PENDING',
    },
  });

  await prisma.filing.update({
    where: { id: filingId },
    data: {
      status: 'SUBMITTED',
      // sunbizFilingNumber stays null until admin enters the real number on
      // approval and we regenerate the Articles with the FILED stamp.
      sunbizTrackingNumber: trackingNumber,
      sunbizPin: pin,
      sunbizSubmittedAt: submittedAt,
      submittedAt,
    },
  });

  await sendEmail({
    type: 'FILING_SUBMITTED',
    to: actor.email ?? '',
    userId: actor.id,
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
