import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  ShieldCheck,
  User,
  Hash,
  CreditCard,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, formatDate, formatDateLong, safeParseJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function FilingDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      managersMembers: { orderBy: { position: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { generatedAt: 'desc' } },
      raServices: { orderBy: { createdAt: 'desc' }, take: 1 },
      annualReports: { orderBy: { dueDate: 'asc' } },
    },
  });
  if (!filing || filing.userId !== session.user.id) notFound();

  const principal = safeParseJson<{
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
  } | null>(filing.principalAddress, null);

  const correspondence = safeParseJson<{ email?: string; phone?: string } | null>(
    filing.correspondenceContact,
    null
  );

  const ra = safeParseJson<{
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    useOurService?: boolean;
  } | null>(filing.registeredAgent, null);

  return (
    <div className="container max-w-5xl py-10 space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        All filings
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">
              {filing.entityType === 'LLC' ? 'Florida Limited Liability Company' : 'Florida Profit Corporation'}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight mt-1">
              {filing.businessName}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusBadge status={filing.status} />
              {filing.sunbizFilingNumber && (
                <Badge variant="outline">
                  <Hash className="h-3 w-3" />
                  <span className="font-mono">{filing.sunbizFilingNumber}</span>
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/documents">
            <Download className="h-4 w-4" />
            All documents
          </Link>
        </Button>
      </div>

      {/* Status timeline */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
            Filing timeline
          </h3>
          <div className="space-y-4">
            <TimelineEvent
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="Filing submitted to Florida Department of State"
              detail={
                filing.sunbizSubmittedAt
                  ? formatDateLong(filing.sunbizSubmittedAt)
                  : 'Pending'
              }
              done={!!filing.sunbizSubmittedAt}
            />
            <TimelineEvent
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="State approved formation"
              detail={
                filing.sunbizApprovedAt
                  ? formatDateLong(filing.sunbizApprovedAt)
                  : 'Typically 1-2 business days from submission'
              }
              done={!!filing.sunbizApprovedAt}
            />
            <TimelineEvent
              icon={<FileText className="h-4 w-4" />}
              title="Documents available"
              detail={
                filing.documents.length > 0
                  ? `${filing.documents.length} documents ready`
                  : 'Will be generated upon approval'
              }
              done={filing.documents.length > 0}
            />
            <TimelineEvent
              icon={<Calendar className="h-4 w-4" />}
              title="Next annual report"
              detail={
                filing.annualReports[0]
                  ? `Due ${formatDateLong(filing.annualReports[0].dueDate)}`
                  : 'Once approved, due Jan 1 – May 1 next year'
              }
              done={false}
            />
          </div>
        </CardContent>
      </Card>

      {/* Two-column details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              Documents
            </h3>
            {filing.documents.length === 0 ? (
              <p className="text-sm text-ink-muted">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-border -mx-2">
                {filing.documents.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/api/documents/${doc.id}`}
                      target="_blank"
                      className="flex items-center gap-3 px-2 py-3 hover:bg-muted/30 rounded-md transition-colors"
                    >
                      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-ink-subtle">{formatDate(doc.generatedAt)}</p>
                      </div>
                      <Download className="h-4 w-4 text-ink-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Registered agent */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Registered agent
            </h3>
            {ra && (
              <div className="space-y-2">
                <p className="font-semibold">{ra.name}</p>
                <p className="text-sm text-ink-muted leading-snug">
                  {ra.street1}
                  {ra.street2 ? `, ${ra.street2}` : ''}
                  <br />
                  {ra.city}, {ra.state} {ra.zip}
                </p>
                {ra.useOurService && (
                  <Badge variant="success" className="mt-2">
                    Free Year-1 included
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Principal address */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              Principal address
            </h3>
            {principal && (
              <p className="text-sm text-ink leading-snug">
                {principal.street1}
                {principal.street2 ? `, ${principal.street2}` : ''}
                <br />
                {principal.city}, {principal.state} {principal.zip}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              {filing.entityType === 'LLC' ? 'Members & Managers' : 'Officers & Directors'}
            </h3>
            <ul className="space-y-2">
              {filing.managersMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                    <span className="font-medium truncate">{m.name}</span>
                    <Badge variant="outline" size="sm">{m.title}</Badge>
                  </div>
                  {m.ownershipPercentage != null && (
                    <span className="text-xs text-ink-muted shrink-0">{m.ownershipPercentage.toFixed(1)}%</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Correspondence */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              Correspondence
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-ink-subtle" />
                <span className="font-mono">{correspondence?.email ?? '—'}</span>
              </div>
              {correspondence?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{correspondence.phone}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-ink-muted" />
              Payment
            </h3>
            {filing.payments.length === 0 ? (
              <p className="text-sm text-ink-muted">No payments yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Total paid</span>
                  <span className="font-semibold">{formatCurrency(filing.totalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Method</span>
                  <span className="font-mono text-xs">
                    {filing.payments[0].cardBrand} •••• {filing.payments[0].cardLast4}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Date</span>
                  <span>{formatDate(filing.payments[0].completedAt ?? filing.payments[0].createdAt)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TimelineEvent({
  icon,
  title,
  detail,
  done,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  done: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          done ? 'bg-success-subtle text-success' : 'bg-muted text-ink-subtle'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? 'text-ink' : 'text-ink-muted'}`}>{title}</p>
        <p className="text-xs text-ink-subtle">{detail}</p>
      </div>
    </div>
  );
}
