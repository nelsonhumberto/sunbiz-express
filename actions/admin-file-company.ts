'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import {
  detectCoverKind,
  filingUsesOurRa,
  processSunbizCoverPdf,
  processSunbizCoverUpload,
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
 * Step 1 of the Sunbiz filing workflow: admin uploads the cover sheet from
 * Sunbiz (HTML / MHTML / PDF). Email blank is filled with notice@ when
 * LaunchForma is RA, otherwise the customer email. PDFs keep the barcode
 * and lose the blank trailing page; HTML/MHTML keep layout and inline the barcode.
 */
export async function uploadSunbizCoverPage(args: {
  filingId: string;
  fileBase64: string;
  mimeType?: string;
  title?: string;
  filename?: string;
  /** Optional barcode JPEG base64 from HTML "Save As" _files/idalin.asp */
  barcodeJpegBase64?: string;
}) {
  await requireAdmin();
  if (!args.fileBase64 || args.fileBase64.length < 8) {
    throw new Error('Uploaded file is missing or empty.');
  }
  const approxBytes = Math.floor((args.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_COVER_BYTES) {
    throw new Error(`Cover page too large (max ${MAX_COVER_BYTES / 1024 / 1024} MB).`);
  }

  const filename = args.filename || args.title || 'cover';
  const kind = detectCoverKind(filename, args.mimeType);
  if (kind === 'unknown') {
    throw new Error('Upload a Sunbiz cover as .html, .htm, .mhtml, or .pdf.');
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

  let storeBase64 = args.fileBase64;
  let mimeType = args.mimeType || 'application/octet-stream';
  let title = args.title?.trim() || 'Sunbiz Cover Page';

  if (kind === 'html') {
    const rawText = Buffer.from(args.fileBase64, 'base64').toString('utf-8');
    const barcodeJpeg = args.barcodeJpegBase64
      ? Buffer.from(args.barcodeJpegBase64, 'base64')
      : undefined;
    const processed = processSunbizCoverUpload({
      rawText,
      filename,
      email: coverEmail,
      barcodeJpeg,
    });
    storeBase64 = Buffer.from(processed.html, 'utf-8').toString('base64');
    mimeType = processed.mimeType;
    title = args.title?.trim() || `Sunbiz Cover Page (${coverEmail})`;
  } else {
    const raw = Buffer.from(args.fileBase64, 'base64');
    const processed = await processSunbizCoverPdf(new Uint8Array(raw), coverEmail);
    storeBase64 = Buffer.from(processed).toString('base64');
    mimeType = 'application/pdf';
    title = args.title?.trim() || `Sunbiz Cover Page (${coverEmail})`;
  }

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
  return { emailUsed: coverEmail, kind, useOurRa };
}
