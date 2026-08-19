import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decodeDocument, filingStatusBadgeHtml } from '@/lib/pdf';
import { htmlDocumentToPdf, pdfFilename } from '@/lib/html-to-pdf';
import { renderArticlesHtml, toFilingForDoc } from '@/lib/filing-documents';
import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';

const ARTICLES_TYPES = new Set(['ARTICLES_ORG', 'ARTICLES_INC']);
const ADMIN_ONLY_TYPES = new Set(['COVER_LETTER', 'SUNBIZ_COVER_PAGE', 'FILE_PACKAGE']);

function isPdfMime(mime: string | null | undefined): boolean {
  return (mime || '').toLowerCase().includes('pdf');
}

function isHtmlMime(mime: string | null | undefined): boolean {
  const m = (mime || '').toLowerCase();
  return m.includes('html') || m.includes('text/plain') || m === '';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      filing: {
        include: {
          managersMembers: true,
          filingAdditionalServices: { include: { service: true } },
        },
      },
    },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isAdmin = session.user.role === 'ADMIN';
  if (doc.filing.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Cover letters / Sunbiz cover pages / file packages are admin-only.
  if (ADMIN_ONLY_TYPES.has(doc.documentType) && !isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'This document is reserved for our filing team.' },
      { status: 403 },
    );
  }

  // Pending placeholders (Cert of Status, Certified Copy, EIN Letter awaiting
  // state/IRS issuance) have empty payloads and aren't customer-downloadable
  // until an admin uploads the real PDF. Admins can still preview/replace the
  // empty row through the admin tooling.
  if (doc.pendingState && !isAdmin) {
    return NextResponse.json(
      {
        error: 'pending_state',
        message:
          'This document is still being issued by Florida or the IRS. We will email you the moment it lands.',
      },
      { status: 425 },
    );
  }

  // Operating Agreements are a paid deliverable. Block downloads when the
  // filing's tier/add-ons no longer entitle the customer to one (e.g. legacy
  // documents generated before the entitlement check existed).
  if (doc.documentType === 'OPERATING_AGREEMENT') {
    const addOnSlugs = doc.filing.filingAdditionalServices.map(
      (fas) => fas.service.serviceSlug as AddOnSlug,
    );
    const oaEntitled =
      doc.filing.entityType === 'LLC' &&
      filingHasOperatingAgreement({
        tier: doc.filing.serviceTier as TierSlug,
        addOnSlugs,
        memberCount: doc.filing.managersMembers.length,
      });
    if (!oaEntitled) {
      return NextResponse.json(
        {
          error: 'payment_required',
          message:
            'This Operating Agreement is not included in your current plan. Add it from the wizard or contact support.',
        },
        { status: 402 },
      );
    }
  }

  // Articles regenerate from live filing data so template fixes (Article IV
  // title, RA signature, layout) apply without re-submitting.
  if (ARTICLES_TYPES.has(doc.documentType)) {
    try {
      let html = renderArticlesHtml(doc.filing);
      // Customer-facing downloads include the status badge (SUBMITTED or FILED).
      // Admin file-package merges never include it.
      const badge = filingStatusBadgeHtml(toFilingForDoc(doc.filing));
      html = html.replace(/(<body[^>]*>)/, `$1\n${badge}`);
      const companyName = (doc.filing.businessName || '')
        .replace(/[^\w\s-]+/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
      const articleType =
        doc.filing.entityType === 'LLC' ? 'Articles-of-Organization' : 'Articles-of-Incorporation';
      const fname = companyName
        ? pdfFilename(`${companyName}-${articleType}`)
        : pdfFilename(doc.title);
      const pdfBytes = await htmlDocumentToPdf(html, doc.title);
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          downloadedCount: { increment: 1 },
          lastDownloadedAt: new Date(),
        },
      });
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fname}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (err) {
      console.error('[documents] Articles PDF failed', doc.id, err);
      return NextResponse.json(
        { error: 'pdf_failed', message: 'Could not generate PDF for this document.' },
        { status: 500 },
      );
    }
  }

  if (!doc.base64) {
    return NextResponse.json(
      { error: 'empty', message: 'This document has no file yet.' },
      { status: 404 },
    );
  }

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      downloadedCount: { increment: 1 },
      lastDownloadedAt: new Date(),
    },
  });

  const filename = pdfFilename(doc.title);
  const rawBytes = Buffer.from(doc.base64, 'base64');

  // Sunbiz cover sheets prefer HTML download (easier to edit). PDFs pass through.
  if (doc.documentType === 'SUNBIZ_COVER_PAGE') {
    if (isPdfMime(doc.mimeType) || rawBytes.subarray(0, 4).toString('utf-8') === '%PDF') {
      return new NextResponse(rawBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    const htmlName = pdfFilename(doc.title).replace(/\.pdf$/i, '.html');
    return new NextResponse(rawBytes, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${htmlName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // Already a PDF (admin-uploaded Cert of Status / EIN letter / etc.)
  if (isPdfMime(doc.mimeType) || rawBytes.subarray(0, 4).toString('utf-8') === '%PDF') {
    return new NextResponse(rawBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // Receipt / OA / Form 2553 stored as HTML - convert on the fly.
  if (isHtmlMime(doc.mimeType) || rawBytes.subarray(0, 15).toString('utf-8').includes('<')) {
    try {
      const html = decodeDocument(doc.base64);
      const pdfBytes = await htmlDocumentToPdf(html, doc.title);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (err) {
      console.error('[documents] HTML→PDF failed', doc.id, err);
      return NextResponse.json(
        { error: 'pdf_failed', message: 'Could not generate PDF for this document.' },
        { status: 500 },
      );
    }
  }

  // Unknown binary - still force download rather than inline HTML.
  const safeExt = isPdfMime(doc.mimeType) ? 'pdf' : 'bin';
  return new NextResponse(rawBytes, {
    headers: {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${pdfFilename(doc.title).replace(/\.pdf$/i, `.${safeExt}`)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
