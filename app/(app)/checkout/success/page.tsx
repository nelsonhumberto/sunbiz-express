import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CheckCircle2,
  FileText,
  ArrowRight,
  Sparkles,
  Mail,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { filing?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  if (!searchParams.filing) redirect('/dashboard');

  const filing = await prisma.filing.findUnique({
    where: { id: searchParams.filing },
    include: { documents: true },
  });
  if (!filing || filing.userId !== session.user.id) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-surface">
      {/* Confetti-ish hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 mesh-bg" />
        <div className="aurora" />
        <div className="container relative py-16 md:py-24 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-success-subtle border-2 border-success/30 mb-6">
            <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight text-balance">
            Your filing is on its way to{' '}
            <span className="italic text-primary">Florida</span>.
          </h1>
          <p className="mt-3 text-lg text-ink-muted max-w-xl mx-auto">
            We've submitted{' '}
            <strong className="text-ink">{filing.businessName}</strong> to the Florida Department of State.
            You'll receive an email confirmation in moments.
          </p>

          {/* Filing details */}
          <div className="mt-10 max-w-2xl mx-auto rounded-2xl border border-border bg-white p-6 md:p-8 text-left shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
              Filing receipt
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label="Business name" value={filing.businessName ?? '—'} />
              <DetailRow label="Entity type" value={filing.entityType === 'LLC' ? 'Florida LLC' : 'Florida Corporation'} />
              <DetailRow label="Sunbiz tracking #" value={filing.sunbizTrackingNumber ?? '—'} mono />
              <DetailRow label="PIN" value={filing.sunbizPin ?? '—'} mono />
              <DetailRow label="Filing #" value={filing.sunbizFilingNumber ?? '—'} mono />
              <DetailRow label="Total paid" value={formatCurrency(filing.totalCents, { showZero: true })} />
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href={`/dashboard/filings/${filing.id}`}>
                View filing details
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="container max-w-3xl py-12">
        <h2 className="font-display text-2xl font-medium text-center mb-8">
          What happens next
        </h2>
        <div className="space-y-3">
          <NextStep
            icon={<Mail className="h-5 w-5 text-primary" />}
            title="Check your email"
            body={`We sent a confirmation receipt and a copy of your Articles to ${session.user.email}.`}
            timing="Now"
          />
          <NextStep
            icon={<ShieldCheck className="h-5 w-5 text-primary" />}
            title="Florida processes your filing"
            body="The Florida Department of State will review and approve your formation. We'll email you the moment your business is officially formed."
            timing="1-2 business days"
          />
          <NextStep
            icon={<FileText className="h-5 w-5 text-primary" />}
            title="Documents ready to download"
            body="You can find your Articles, Operating Agreement, and Filing Receipt in your dashboard right now."
            timing="Available now"
          />
          <NextStep
            icon={<Sparkles className="h-5 w-5 text-accent" />}
            title="Open a business bank account"
            body="Most banks accept your Articles + EIN + Operating Agreement to open an account. We've prepared all three for you."
            timing="When approved"
          />
          <NextStep
            icon={<Clock className="h-5 w-5 text-warn" />}
            title="Annual report reminders"
            body="We'll email you 60, 30, and 3 days before next year's deadline (Jan 1 – May 1) so you never pay the $400 late fee."
            timing="Yearly"
          />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-ink-subtle uppercase tracking-wider">{label}</p>
      <p className={mono ? 'font-mono text-sm text-ink' : 'text-sm text-ink font-medium'}>{value}</p>
    </div>
  );
}

function NextStep({
  icon,
  title,
  body,
  timing,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  timing: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-white p-5">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="font-semibold text-ink">{title}</p>
          <span className="text-xs text-ink-subtle">{timing}</span>
        </div>
        <p className="text-sm text-ink-muted mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
