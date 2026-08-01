'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import {
  filingUsesOurRa,
  processSunbizCoverPdf,
  resolveSunbizCoverEmail,
} from '@/lib/sunbiz-cover';

const MAX_COVER_BYTES = 8 * 1024 * 1024;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return session;
}

/**
 * Step 1 of the Sunbiz filing workflow: admin uploads the cover sheet PDF
 * from Sunbiz. The email blank is stamped with notice@launchforma.com when
 * LaunchForma is RA, otherwise the customer email. Trailing blank pages
 * are removed automatically.
 */
export async function uploadSunbizCoverPage(args: {
  filingId: string;
  fileBase64: string;
  mimeType?: string;
  title?: string;
  filename?: string;
}) {
  await requireAdmin();
  if (!args.fileBase64 || args.fileBase64.length < 8) {
    throw new Error('Uploaded file is missing or empty.');
  }
  const approxBytes = Math.floor((args.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_COVER_BYTES) {
    throw new Error(`Cover page too large (max ${MAX_COVER_BYTES / 1024 / 1024} MB).`);
  }

  const filename = args.filename || args.title || 'cover.pdf';
  const lower = filename.toLowerCase();
  if (!lower.endsWith('.pdf') && !(args.mimeType || '').includes('pdf')) {
    throw new Error('Only PDF files are supported. Print the Sunbiz cover to PDF before uploading.');
  }

  const filing = await prisma.filing.findUnique({
    where: { id: args.filingId },
    include: { user: { select: { email: true } } },
  });
  if (!filing) throw new Error('Filing not found');

  const correspondence = safeParseJson<{ email?: string } | null>(
    filing.correspondenceContact,
    null,
  );
  const useOurRa = filingUsesOurRa(filing.registeredAgent);
  const coverEmail = resolveSunbizCoverEmail({
    useOurRegisteredAgent: useOurRa,
    customerEmail: correspondence?.email || filing.user?.email,
  });

  const raw = Buffer.from(args.fileBase64, 'base64');
  const processed = await processSunbizCoverPdf(new Uint8Array(raw), coverEmail);
  const storeBase64 = Buffer.from(processed).toString('base64');
  const mimeType = 'application/pdf';
  const title = args.title?.trim() || `Sunbiz Cover Page (${coverEmail})`;

  const fileSizeBytes = Math.floor((storeBase64.length * 3) / 4);
  const existing = await prisma.document.findFirst({
    where: { filingId: filing.id, documentType: 'SUNBIZ_COVER_PAGE' },
  });

  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        base64: storeBase64,
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
        documentType: 'SUNBIZ_COVER_PAGE',
        title,
        base64: storeBase64,
        mimeType,
        fileSizeBytes,
        pendingState: false,
        uploadedAt: new Date(),
      },
    });
  }

  revalidatePath(`/admin/filings/${args.filingId}`);
  return { emailUsed: coverEmail, kind: 'pdf' as const, useOurRa };
}
