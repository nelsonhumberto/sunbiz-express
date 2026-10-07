'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  generateArticlesOfOrganization,
  generateArticlesOfIncorporation,
  encodeDocument,
} from '@/lib/pdf';
import { safeParseJson } from '@/lib/utils';
import { getFormationState } from '@/lib/formation-states';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { TOTAL_DISPLAYED_STEPS, TOTAL_STEPS } from '@/lib/wizard-constants';

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

/**
 * Toggle admin archive on a filing. Archived filings stay in the DB (never
 * deleted) but are excluded from analytics and hidden from the default
 * admin filings list - use for auditors, internal tests, and junk drafts.
 */
export async function toggleAdminArchiveFiling(filingId: string) {
  const session = await requireAdmin();
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { id: true, adminArchivedAt: true, businessName: true },
  });
  if (!filing) throw new Error('Filing not found');

  const nextArchivedAt = filing.adminArchivedAt ? null : new Date();
  await prisma.filing.update({
    where: { id: filingId },
    data: { adminArchivedAt: nextArchivedAt },
  });

  await prisma.adminAction.create({
    data: {
      adminUserId: session.user!.id,
      filingId,
      actionType: nextArchivedAt ? 'ADMIN_ARCHIVE' : 'ADMIN_UNARCHIVE',
      description: nextArchivedAt
        ? `Archived filing (excluded from analytics): ${filing.businessName ?? filingId}`
        : `Restored filing to analytics: ${filing.businessName ?? filingId}`,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/filings');
  revalidatePath('/admin/analytics');
  revalidatePath(`/admin/filings/${filingId}`);
  return { archived: Boolean(nextArchivedAt) };
}

/**
 * Re-attempt delivery of a previously FAILED/QUEUED email notification,
 * re-rendering the template with current branding. Used after SMTP/Resend
 * credentials are fixed so real customers (e.g. Cafecito Tech) get their mail.
 *
 * For WELCOME emails that originally included a temp password: mint a fresh
 * password, update the user hash, and include credentials in the resend
 * (we never store plaintext passwords, so the original cannot be recovered).
 */
export async function resendEmailNotification(notificationId: string) {
  await requireAdmin();
  const existing = await prisma.emailNotification.findUnique({
    where: { id: notificationId },
    include: {
      filing: {
        select: {
          id: true,
          businessName: true,
          entityType: true,
          sunbizFilingNumber: true,
          sunbizTrackingNumber: true,
          sunbizPin: true,
          totalCents: true,
        },
      },
      user: { select: { id: true, firstName: true, email: true } },
    },
  });
  if (!existing) throw new Error('Email notification not found');

  const type = existing.notificationType as import('@/lib/email').NotificationType;
  const loginEmail = existing.user?.email ?? existing.recipientEmail;
  const filingUrl = existing.filingId
    ? `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com'}/dashboard/filings/${existing.filingId}`
    : undefined;

  let tempPassword: string | undefined;
  // WELCOME with credentials: always issue a fresh temp password on resend so
  // the customer can sign in. (Plaintext from the original send is not stored.)
  if (type === 'WELCOME' && existing.userId) {
    const { generateReadableTempPassword } = await import('@/lib/temp-password');
    const bcrypt = (await import('bcryptjs')).default;
    tempPassword = generateReadableTempPassword();
    await prisma.user.update({
      where: { id: existing.userId },
      data: { passwordHash: await bcrypt.hash(tempPassword, 10) },
    });
  }

  const result = await sendEmail({
    type,
    to: existing.recipientEmail,
    filingId: existing.filingId ?? undefined,
    userId: existing.userId ?? undefined,
    context: {
      firstName: existing.user?.firstName ?? undefined,
      businessName: existing.filing?.businessName ?? undefined,
      entityType: (existing.filing?.entityType as 'LLC' | 'CORP') ?? undefined,
      totalCents: existing.filing?.totalCents ?? undefined,
      filingNumber: existing.filing?.sunbizFilingNumber ?? undefined,
      trackingNumber: existing.filing?.sunbizTrackingNumber ?? undefined,
      pin: existing.filing?.sunbizPin ?? undefined,
      loginEmail,
      tempPassword,
      resumeUrl: filingUrl,
    },
  });

  revalidatePath('/admin/outbox');
  revalidatePath('/admin');
  return { status: result.status, errorMessage: result.errorMessage ?? null };
}

export interface ReengageResult {
  ok: boolean;
  message: string;
}

const REENGAGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Admin-triggered re-engagement email for an unpaid draft. The CTA lands the
 * customer on their last wizard step: guests through the tokenized /resume
 * link, account holders through sign-in with a same-origin `next` path.
 * Limited to one send per draft per 24 hours.
 */
export async function sendDraftReengagementEmail(filingId: string): Promise<ReengageResult> {
  const session = await requireAdmin();
  const limited = checkActionRateLimit('admin-reengage', 30, 60_000, session.user!.id);
  if (limited) return { ok: false, message: limited };

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: {
      id: true,
      userId: true,
      status: true,
      adminArchivedAt: true,
      businessName: true,
      entityType: true,
      state: true,
      currentStep: true,
      completedSteps: true,
      user: { select: { firstName: true, email: true, accountStatus: true, guestToken: true } },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
    },
  });
  if (!filing) return { ok: false, message: 'Draft not found.' };
  if (filing.status !== 'DRAFT' || filing.payments.length > 0) {
    return { ok: false, message: 'This filing is already paid or submitted.' };
  }
  if (filing.adminArchivedAt) return { ok: false, message: 'This draft is archived.' };

  // QUEUED counts too: it exists from the moment a send starts, which closes
  // the window for two near-simultaneous clicks.
  const recent = await prisma.emailNotification.findFirst({
    where: {
      filingId: filing.id,
      notificationType: 'DRAFT_REENGAGE',
      status: { in: ['SENT', 'QUEUED'] },
      createdAt: { gte: new Date(Date.now() - REENGAGE_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) {
    return { ok: false, message: 'A re-engagement email already went out in the last 24 hours.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const step = filing.currentStep && filing.currentStep >= 1 ? filing.currentStep : 2;
  const resumeUrl =
    filing.user.accountStatus === 'GUEST' && filing.user.guestToken
      ? `${siteUrl}/resume?f=${filing.id}&t=${filing.user.guestToken}`
      : `${siteUrl}/sign-in?next=${encodeURIComponent(`/wizard/${filing.id}/${step}`)}`;
  const completed = safeParseJson<number[]>(filing.completedSteps, []);

  const result = await sendEmail({
    type: 'DRAFT_REENGAGE',
    to: filing.user.email,
    filingId: filing.id,
    userId: filing.userId,
    context: {
      firstName: filing.user.firstName,
      businessName: filing.businessName ?? undefined,
      entityType: filing.entityType === 'CORP' ? 'CORP' : 'LLC',
      stateName: getFormationState(filing.state).name,
      stepsCompleted: Math.min(completed.length, TOTAL_DISPLAYED_STEPS),
      readyForCheckout: step === TOTAL_STEPS,
      resumeUrl,
    },
  });

  await prisma.adminAction.create({
    data: {
      adminUserId: session.user!.id,
      filingId: filing.id,
      actionType: 'DRAFT_REENGAGE_EMAIL',
      description: `Re-engagement email to ${filing.user.email}: ${result.status}`,
    },
  });

  revalidatePath('/admin/drafts');
  revalidatePath('/admin/outbox');
  return result.status === 'SENT'
    ? { ok: true, message: `Re-engagement email sent to ${filing.user.email}.` }
    : { ok: false, message: result.errorMessage ?? 'Delivery failed. Check the email provider settings.' };
}
