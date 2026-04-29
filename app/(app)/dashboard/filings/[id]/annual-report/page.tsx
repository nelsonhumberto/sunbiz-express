import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import { FL } from '@/lib/florida';
import { AnnualReportForm, type AnnualReportFormProps, type SavedCard } from '@/components/dashboard/AnnualReportForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

type Address = {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
};

type SnapshotAddress = {
  address_1?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type LinkedSnapshot = {
  fei_number?: string;
  principal_address?: SnapshotAddress;
  mailing_address?: SnapshotAddress;
  registered_agent?: { name?: string; address?: SnapshotAddress };
  officers?: { name: string; title: string }[];
};

function snapshotAddrToAddr(a: SnapshotAddress | undefined): Address {
  return {
    street1: a?.address_1 ?? '',
    city: a?.city ?? '',
    state: a?.state ?? 'FL',
    zip: a?.zip ?? '',
  };
}

export default async function AnnualReportPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      managersMembers: { orderBy: { position: 'asc' } },
      annualReports: { orderBy: { dueDate: 'asc' } },
      payments: {
        where: { status: 'SUCCEEDED' },
        orderBy: { completedAt: 'desc' },
        take: 1,
        select: { cardLast4: true, cardBrand: true, cardholderName: true, stripePaymentMethodId: true },
      },
    },
  });

  if (!filing || filing.userId !== session.user.id) notFound();

  // Find the next pending annual report to file
  let pendingReport = filing.annualReports.find(
    (r) => r.status === 'PENDING' || r.status === 'OVERDUE',
  );

  // If none exists yet (company was linked before annual report creation was added,
  // or it's a newly approved WIZARD filing), create one for the current year.
  if (!pendingReport) {
    const currentYear = new Date().getFullYear();
    const alreadyFiled = filing.annualReports.some((r) => r.reportYear === currentYear && r.status === 'FILED');
    if (alreadyFiled) {
      redirect(`/dashboard/filings/${params.id}`);
    }
    const stateFee =
      filing.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp;
    pendingReport = await prisma.annualReport.upsert({
      where: { filingId_reportYear: { filingId: filing.id, reportYear: currentYear } },
      update: {},
      create: {
        filingId: filing.id,
        reportYear: currentYear,
        dueDate: new Date(`${currentYear}-05-01T23:59:00`),
        status: 'PENDING',
        filingFeeCents: stateFee,
        totalCostCents: stateFee,
      },
    });
  }

  // ── Build form props from stored data ──────────────────────────────────
  const snapshot = safeParseJson<LinkedSnapshot | null>(filing.linkedEntitySnapshot, null);

  const storedPrincipal = safeParseJson<Address | null>(filing.principalAddress, null);
  const storedMailing = safeParseJson<Address | null>(filing.mailingAddress, null);
  const storedRa = safeParseJson<{
    name?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    useOurService?: boolean;
  } | null>(filing.registeredAgent, null);

  // Prefer the stored (possibly edited) address; fall back to the original snapshot
  const principalAddress: Address = storedPrincipal ?? snapshotAddrToAddr(snapshot?.principal_address);
  const mailingAddress: Address = storedMailing ?? snapshotAddrToAddr(snapshot?.mailing_address);

  const registeredAgentName =
    storedRa?.name ?? snapshot?.registered_agent?.name ?? '';
  const registeredAgentAddress: Address = storedRa?.street1
    ? {
        street1: storedRa.street1,
        street2: storedRa.street2,
        city: storedRa.city ?? '',
        state: storedRa.state ?? 'FL',
        zip: storedRa.zip ?? '',
      }
    : snapshotAddrToAddr(snapshot?.registered_agent?.address);

  // Officers: prefer live DB rows; fall back to snapshot officers
  const officers: AnnualReportFormProps['officers'] =
    filing.managersMembers.length > 0
      ? filing.managersMembers.map((m) => ({
          id: m.id,
          name: m.name,
          title: m.title,
        }))
      : (snapshot?.officers ?? []).map((o) => ({
          name: o.name,
          title: o.title,
        }));

  const ein = snapshot?.fei_number ?? null;

  const lastPayment = filing.payments[0];
  const savedCard: SavedCard | null =
    lastPayment?.cardLast4
      ? {
          last4: lastPayment.cardLast4,
          brand: lastPayment.cardBrand ?? 'Card',
          cardholderName: lastPayment.cardholderName ?? '',
          paymentMethodId: lastPayment.stripePaymentMethodId ?? undefined,
        }
      : null;

  const formProps: AnnualReportFormProps = {
    filingId: filing.id,
    annualReportId: pendingReport.id,
    reportYear: pendingReport.reportYear,
    companyName: filing.businessName ?? '',
    entityType: filing.entityType as 'LLC' | 'CORP',
    documentNumber: filing.sunbizFilingNumber,
    ein,
    registeredAgentName,
    registeredAgentAddress,
    principalAddress,
    mailingAddress,
    officers,
    raIsOurs: storedRa?.useOurService ?? false,
    savedCard,
  };

  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <Link
        href={`/dashboard/filings/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to filing
      </Link>

      <div>
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium mb-1">
          Annual Report — Florida
        </p>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {pendingReport.reportYear} Annual Report
        </h1>
        <p className="text-sm text-ink-muted mt-2">
          Review your information. Click <strong>CHANGE</strong> on any section that needs updates before proceeding.
        </p>
      </div>

      <AnnualReportForm {...formProps} />
    </div>
  );
}
