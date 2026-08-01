import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { renderArticlesHtml } from '@/lib/filing-documents';
import { htmlDocumentToPdf, mergePdfDocuments, pdfFilename } from '@/lib/html-to-pdf';
import { NOTICE_EMAIL, stripBlankPdfPages } from '@/lib/sunbiz-cover';
import { telnyxSendFax, normalizeFaxNumber, TelnyxError } from '@/lib/telnyx';

export const dynamic = 'force-dynamic';

const SUNBIZ_FAX = '+18506176381';

async function buildMergedPdf(filingId: string) {
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: { managersMembers: true, documents: true },
  });
  if (!filing) throw new Error('Filing not found');

  const cover = filing.documents.find((d) => d.documentType === 'SUNBIZ_COVER_PAGE' && d.base64);
  if (!cover?.base64) {
    throw new Error('Upload the Sunbiz cover page first, then click FILE the company.');
  }

  const raw = Buffer.from(cover.base64, 'base64');
  const mime = (cover.mimeType || '').toLowerCase();
  const isPdf = mime.includes('pdf') || raw.subarray(0, 4).toString('utf-8') === '%PDF';
  if (!isPdf) {
    throw new Error('Cover page must be a PDF. Print the Sunbiz cover to PDF before uploading.');
  }

  const coverPdf = await stripBlankPdfPages(new Uint8Array(raw));
  const articlesHtml = renderArticlesHtml(filing);
  const articlesTitle =
    filing.entityType === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation';
  const articlesBytes = await htmlDocumentToPdf(articlesHtml, articlesTitle);
  const merged = await mergePdfDocuments([coverPdf, articlesBytes]);

  const safeName = (filing.businessName || 'filing')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);

  const mergedB64 = Buffer.from(merged).toString('base64');
  const existing = filing.documents.find((d) => d.documentType === 'FILE_PACKAGE');
  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: {
        base64: mergedB64,
        mimeType: 'application/pdf',
        fileSizeBytes: merged.length,
        title: 'Sunbiz File Package (cover + articles)',
        generatedAt: new Date(),
      },
    });
  } else {
    await prisma.document.create({
      data: {
        filingId: filing.id,
        documentType: 'FILE_PACKAGE',
        title: 'Sunbiz File Package (cover + articles)',
        base64: mergedB64,
        mimeType: 'application/pdf',
        fileSizeBytes: merged.length,
      },
    });
  }

  return { merged, mergedB64, filename: pdfFilename(`${safeName}-Sunbiz-File-Package`), filing };
}

/**
 * GET: Download the merged cover + articles PDF for preview.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { merged, filename } = await buildMergedPdf(params.id);
    return new NextResponse(Buffer.from(merged), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not merge cover page and articles.';
    console.error('[file-package] GET failed', params.id, err);
    return NextResponse.json({ error: 'merge_failed', message }, { status: 400 });
  }
}

/**
 * POST: Merge cover + articles and fax the result to Sunbiz.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connectionId = process.env.TELNYX_FAX_CONNECTION_ID?.trim();
  const from = process.env.TELNYX_FAX_FROM?.trim();
  if (!connectionId || !from) {
    return NextResponse.json(
      { error: 'config_missing', message: 'Telnyx fax is not configured (TELNYX_FAX_CONNECTION_ID / TELNYX_FAX_FROM).' },
      { status: 500 },
    );
  }

  let mergedB64: string;
  let filing: { id: string; businessName: string | null };
  try {
    const result = await buildMergedPdf(params.id);
    mergedB64 = result.mergedB64;
    filing = result.filing;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not merge cover page and articles.';
    return NextResponse.json({ error: 'merge_failed', message }, { status: 400 });
  }

  const accessToken = crypto.randomBytes(24).toString('hex');
  const fax = await prisma.faxMessage.create({
    data: {
      direction: 'OUTBOUND',
      toNumber: SUNBIZ_FAX,
      fromNumber: from,
      status: 'queued',
      mediaName: `${filing.businessName || 'filing'}-file-package.pdf`,
      mediaMime: 'application/pdf',
      mediaBase64: mergedB64,
      accessToken,
      createdBy: session.user.id,
    },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://launchforma.com';
  const mediaUrl = `${siteUrl}/api/admin/fax/media/${fax.id}?t=${accessToken}`;

  try {
    const result = await telnyxSendFax({
      to: SUNBIZ_FAX,
      from,
      mediaUrl,
      connectionId,
    });
    await prisma.faxMessage.update({
      where: { id: fax.id },
      data: { status: result.status || 'sending', telnyxFaxId: result.id || null },
    });
    logger.info('Sunbiz fax sent', { area: 'filing', entityId: filing.id, tag: 'fax' });
    return NextResponse.json({ ok: true, faxId: fax.id, status: result.status });
  } catch (err) {
    const message = err instanceof TelnyxError ? err.message : 'Failed to send fax to Sunbiz.';
    logger.error('Sunbiz fax failed', { area: 'filing', entityId: filing.id, tag: 'fax' }, err);
    await prisma.faxMessage.update({
      where: { id: fax.id },
      data: { status: 'failed', errorMessage: message },
    });
    return NextResponse.json({ error: 'fax_failed', message }, { status: 500 });
  }
}
