import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { renderArticlesHtml } from '@/lib/filing-documents';
import { htmlDocumentToPdf, mergePdfDocuments, pdfFilename } from '@/lib/html-to-pdf';

export const dynamic = 'force-dynamic';

/**
 * Step 2 of Sunbiz filing (no fax yet):
 * Merge the uploaded Sunbiz cover page + freshly generated Articles into one
 * PDF and download it. Cover may be HTML (preferred) or PDF.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: { managersMembers: true, documents: true },
  });
  if (!filing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const cover = filing.documents.find((d) => d.documentType === 'SUNBIZ_COVER_PAGE' && d.base64);
  if (!cover?.base64) {
    return NextResponse.json(
      {
        error: 'cover_missing',
        message: 'Upload the Sunbiz cover page first, then click FILE the company.',
      },
      { status: 400 },
    );
  }

  try {
    const raw = Buffer.from(cover.base64, 'base64');
    const mime = (cover.mimeType || '').toLowerCase();
    const isHtml =
      mime.includes('html') ||
      raw.subarray(0, 80).toString('utf-8').toLowerCase().includes('<!doctype') ||
      raw.subarray(0, 80).toString('utf-8').toLowerCase().includes('<html');

    let coverPdf: Uint8Array;
    if (isHtml) {
      coverPdf = await htmlDocumentToPdf(raw.toString('utf-8'), 'Sunbiz Cover Page');
    } else if (
      mime.includes('pdf') ||
      raw.subarray(0, 4).toString('utf-8') === '%PDF'
    ) {
      coverPdf = new Uint8Array(raw);
    } else {
      return NextResponse.json(
        {
          error: 'unsupported_cover',
          message: 'Cover page must be HTML or PDF.',
        },
        { status: 400 },
      );
    }

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
    const filename = pdfFilename(`${safeName}-Sunbiz-File-Package`);

    const existing = filing.documents.find((d) => d.documentType === 'FILE_PACKAGE');
    const mergedB64 = Buffer.from(merged).toString('base64');
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

    return new NextResponse(Buffer.from(merged), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[file-package] merge failed', params.id, err);
    return NextResponse.json(
      { error: 'merge_failed', message: 'Could not merge cover page and articles.' },
      { status: 500 },
    );
  }
}
