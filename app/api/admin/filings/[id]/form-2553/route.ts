import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import { decryptString } from '@/lib/encryption';
import { getFormationState } from '@/lib/formation-states';
import { generateForm2553Pdf, type Form2553Shareholder } from '@/lib/form2553';

export const dynamic = 'force-dynamic';

interface AddressLike {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Admin-only: download the official IRS Form 2553 prefilled from the filing.
 * Generated on demand (never stored) so full SSNs aren't persisted in a blob.
 * The corporation EIN and wet signatures are left blank for the officer.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: { managersMembers: { orderBy: { position: 'asc' } } },
  });
  if (!filing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const rule = getFormationState(filing.state);
  const principal = safeParseJson<AddressLike | null>(filing.principalAddress, null);
  const opt = safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null);
  const correspondence = safeParseJson<{ phone?: string } | null>(
    filing.correspondenceContact,
    null,
  );
  const shareStructure = (opt?.shareStructure ?? null) as
    | { issuedShares?: number; shareholders?: Array<Record<string, unknown>> }
    | null;
  const issued = shareStructure?.issuedShares ?? 0;
  const effectiveDate = typeof opt?.effectiveDate === 'string' ? (opt.effectiveDate as string) : undefined;

  // Officer who signs Part I — prefer the President, else first director/owner.
  const president = filing.managersMembers.find((m) => m.title === 'PRESIDENT');
  const officer = president ?? filing.managersMembers[0];

  let shareholders: Form2553Shareholder[] = [];
  if (filing.entityType === 'CORP' && Array.isArray(shareStructure?.shareholders)) {
    shareholders = shareStructure!.shareholders!.map((s) => {
      let taxId = '';
      const enc = s.taxIdEncrypted as string | undefined;
      if (enc) {
        try {
          taxId = decryptString(enc);
        } catch {
          /* leave blank if undecryptable */
        }
      }
      const shares = s.shares as number | undefined;
      const sharesStr =
        shares != null && issued
          ? `${shares} (${((shares / issued) * 100).toFixed(1)}%)`
          : shares != null
            ? String(shares)
            : undefined;
      return {
        name: String(s.name ?? ''),
        address: [s.street1, s.city, s.state, s.zip].filter(Boolean).join(', ') || undefined,
        shares: sharesStr,
        datesAcquired: effectiveDate,
        taxId,
        taxYearEnd: (s.taxYearEnd as string | undefined) ?? '12/31',
      };
    });
  } else {
    // LLC electing S-Corp (or corp without a captured share table): list members.
    shareholders = filing.managersMembers.map((m) => ({
      name: m.name,
      address: [m.street1, m.city, m.state, m.zip].filter(Boolean).join(', ') || undefined,
      shares: m.ownershipPercentage != null ? `${m.ownershipPercentage}%` : undefined,
      datesAcquired: effectiveDate,
      taxId: '', // member tax IDs entered on the signed copy
      taxYearEnd: '12/31',
    }));
  }

  const pdf = await generateForm2553Pdf({
    businessName: filing.businessName ?? '',
    street: principal
      ? [principal.street1, principal.street2].filter(Boolean).join(', ')
      : undefined,
    cityStateZip: principal
      ? `${principal.city ?? ''}, ${principal.state ?? rule.code} ${principal.zip ?? ''}`.trim()
      : undefined,
    stateOfIncorporation: rule.name,
    dateIncorporated: effectiveDate,
    effectiveDate,
    officerName: officer?.name,
    officerTitle: president ? 'President' : officer?.title ?? 'Officer',
    officerPhone: correspondence?.phone,
    shareholders,
  });

  const safeName = (filing.businessName || 'entity').replace(/[^a-z0-9]+/gi, '-');
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Form2553-${safeName}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
