'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email-mock';
import {
  generateArticlesOfOrganization,
  generateArticlesOfIncorporation,
  encodeDocument,
} from '@/lib/pdf';
import { safeParseJson } from '@/lib/utils';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return session;
}

/**
 * Loose Florida filing-number sanity check. Real numbers look like
 * `L26000123456` (LLC) or `P26000123456` (profit corp). We accept any
 * uppercase letter followed by 11 digits; tighter validation lives in the
 * admin UI form.
 */
function looksLikeSunbizFilingNumber(value: string): boolean {
  return /^[A-Z][0-9]{11}$/.test(value.trim());
}

export async function advanceFilingStatus(
  filingId: string,
  options?: { sunbizFilingNumber?: string },
) {
  await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      user: true,
      managersMembers: { orderBy: { position: 'asc' } },
    },
  });
  if (!filing) throw new Error('Not found');

  let newStatus = filing.status;
  let approvedAt: Date | null = null;

  if (filing.status === 'DRAFT') {
    newStatus = 'SUBMITTED';
  } else if (filing.status === 'SUBMITTED') {
    newStatus = 'APPROVED';
    approvedAt = new Date();
  } else {
    return; // already terminal
  }

  // Florida filing number is REQUIRED to move SUBMITTED → APPROVED. The
  // admin enters whatever Sunbiz returned (e.g. L26000123456). Without it
  // we cannot stamp the Articles correctly.
  let sunbizFilingNumber = filing.sunbizFilingNumber;
  if (newStatus === 'APPROVED') {
    const provided = options?.sunbizFilingNumber?.trim();
    if (!provided) {
      throw new Error('A Sunbiz filing number is required to approve this filing.');
    }
    if (!looksLikeSunbizFilingNumber(provided)) {
      throw new Error(
        'Filing number does not match the Sunbiz format (expected one letter followed by 11 digits, e.g. L26000123456).',
      );
    }
    sunbizFilingNumber = provided;
  }

  await prisma.filing.update({
    where: { id: filingId },
    data: {
      status: newStatus,
      ...(approvedAt ? { sunbizApprovedAt: approvedAt } : {}),
      ...(sunbizFilingNumber !== filing.sunbizFilingNumber
        ? { sunbizFilingNumber }
        : {}),
    },
  });

  // On approval, regenerate the Articles with the official filing number so
  // the FILED stamp now displays the real Sunbiz number + approval date.
  if (newStatus === 'APPROVED' && sunbizFilingNumber) {
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
      sunbizFilingNumber,
      sunbizApprovedAt: approvedAt,
      submittedAt: filing.submittedAt,
      managersMembers: filing.managersMembers,
    };
    const articles =
      filing.entityType === 'LLC'
        ? generateArticlesOfOrganization(
            filingForDoc as Parameters<typeof generateArticlesOfOrganization>[0],
          )
        : generateArticlesOfIncorporation(
            filingForDoc as Parameters<typeof generateArticlesOfIncorporation>[0],
          );

    const articlesType = filing.entityType === 'LLC' ? 'ARTICLES_ORG' : 'ARTICLES_INC';
    const existing = await prisma.document.findFirst({
      where: { filingId: filing.id, documentType: articlesType },
    });
    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: {
          base64: encodeDocument(articles),
          mimeType: 'text/html',
          fileSizeBytes: articles.length,
          generatedAt: new Date(),
        },
      });
    } else {
      await prisma.document.create({
        data: {
          filingId: filing.id,
          documentType: articlesType,
          title:
            filing.entityType === 'LLC'
              ? 'Articles of Organization'
              : 'Articles of Incorporation',
          base64: encodeDocument(articles),
          mimeType: 'text/html',
          fileSizeBytes: articles.length,
        },
      });
    }
  }

  if (newStatus === 'APPROVED' && filing.user) {
    await sendEmail({
      type: 'FILING_APPROVED',
      to: filing.user.email,
      userId: filing.userId,
      filingId: filing.id,
      context: {
        businessName: filing.businessName ?? '',
        filingNumber: sunbizFilingNumber ?? undefined,
      },
    });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/filings');
  revalidatePath(`/admin/filings/${filingId}`);
  revalidatePath(`/dashboard/filings/${filingId}`);
}

/**
 * Admin uploads the actual PDF received from Florida (Cert of Status,
 * Certified Copy) or the IRS (EIN Letter / CP 575). Flips `pendingState` off
 * so the customer can download it from their dashboard.
 */
export async function uploadIssuedDocument(args: {
  filingId: string;
  documentType: 'CERT_STATUS' | 'CERT_COPY' | 'EIN_LETTER';
  fileBase64: string;
  mimeType?: string;
  title?: string;
}) {
  await requireAdmin();
  if (!args.fileBase64 || args.fileBase64.length < 8) {
    throw new Error('Uploaded file is missing or empty.');
  }

  const filing = await prisma.filing.findUnique({
    where: { id: args.filingId },
    include: { user: true },
  });
  if (!filing) throw new Error('Filing not found');

  const titleByType: Record<typeof args.documentType, string> = {
    CERT_STATUS: 'Certificate of Status',
    CERT_COPY: 'Certified Copy of Articles',
    EIN_LETTER: 'EIN Confirmation Letter (CP 575)',
  };
  const title = args.title ?? titleByType[args.documentType];
  const mimeType = args.mimeType ?? 'application/pdf';
  const fileSizeBytes = Math.floor((args.fileBase64.length * 3) / 4);

  const existing = await prisma.document.findFirst({
    where: { filingId: filing.id, documentType: args.documentType },
  });
  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        base64: args.fileBase64,
        mimeType,
        fileSizeBytes,
        title,
        pendingState: false,
        uploadedAt: new Date(),
        generatedAt: new Date(),
      },
    });
  } else {
    await prisma.document.create({
      data: {
        filingId: filing.id,
        documentType: args.documentType,
        title,
        base64: args.fileBase64,
        mimeType,
        fileSizeBytes,
        pendingState: false,
        uploadedAt: new Date(),
      },
    });
  }

  if (filing.user) {
    await sendEmail({
      type: 'FILING_APPROVED',
      to: filing.user.email,
      userId: filing.userId,
      filingId: filing.id,
      context: {
        businessName: filing.businessName ?? '',
        filingNumber: filing.sunbizFilingNumber ?? undefined,
      },
    });
  }

  revalidatePath(`/admin/filings/${args.filingId}`);
  revalidatePath(`/dashboard/filings/${args.filingId}`);
  revalidatePath('/dashboard/documents');
}

export async function rejectFiling(filingId: string, reason: string) {
  await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { user: true },
  });
  if (!filing) throw new Error('Not found');

  await prisma.filing.update({
    where: { id: filingId },
    data: {
      status: 'REJECTED',
      sunbizRejectionReason: reason,
    },
  });

  if (filing.user) {
    await sendEmail({
      type: 'FILING_REJECTED',
      to: filing.user.email,
      userId: filing.userId,
      filingId: filing.id,
      context: { businessName: filing.businessName ?? '', rejectionReason: reason },
    });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/filings');
}
