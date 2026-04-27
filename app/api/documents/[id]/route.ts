import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decodeDocument } from '@/lib/pdf';
import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';

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

  // Cover letters are admin-only — they accompany the Articles to the state
  // and contain our internal handling info, not a customer deliverable.
  if (doc.documentType === 'COVER_LETTER' && !isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Cover letters are reserved for our filing team.' },
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

  await prisma.document.update({
    where: { id: doc.id },
    data: {
      downloadedCount: { increment: 1 },
      lastDownloadedAt: new Date(),
    },
  });

  const body = decodeDocument(doc.base64);
  return new NextResponse(body, {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename="${doc.title}.html"`,
    },
  });
}
