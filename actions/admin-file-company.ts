'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  return session;
}

/**
 * Step 1 of the Sunbiz filing workflow: admin uploads the 1-page cover page
 * generated on Sunbiz. Stored as SUNBIZ_COVER_PAGE (admin-only). Step 2
 * (merge + download) is handled by /api/admin/filings/[id]/file-package.
 */
export async function uploadSunbizCoverPage(args: {
  filingId: string;
  fileBase64: string;
  mimeType?: string;
  title?: string;
}) {
  await requireAdmin();
  if (!args.fileBase64 || args.fileBase64.length < 8) {
    throw new Error('Uploaded file is missing or empty.');
  }
  const approxBytes = Math.floor((args.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_COVER_BYTES) {
    throw new Error(`Cover page too large (max ${MAX_COVER_BYTES / 1024 / 1024} MB).`);
  }
  const mime = (args.mimeType || 'application/pdf').toLowerCase();
  if (!mime.includes('pdf')) {
    throw new Error('Sunbiz cover page must be a PDF.');
  }

  const filing = await prisma.filing.findUnique({ where: { id: args.filingId } });
  if (!filing) throw new Error('Filing not found');

  const title = args.title?.trim() || 'Sunbiz Cover Page';
  const existing = await prisma.document.findFirst({
    where: { filingId: filing.id, documentType: 'SUNBIZ_COVER_PAGE' },
  });

  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        base64: args.fileBase64,
        mimeType: 'application/pdf',
        fileSizeBytes: approxBytes,
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
        base64: args.fileBase64,
        mimeType: 'application/pdf',
        fileSizeBytes: approxBytes,
        pendingState: false,
        uploadedAt: new Date(),
      },
    });
  }

  revalidatePath(`/admin/filings/${args.filingId}`);
}
