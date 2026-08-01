import { redirect } from 'next/navigation';
import { Printer, Inbox, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FaxSendForm } from './fax-send-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fax · Admin', robots: { index: false, follow: false } };

const STATUS_TONE: Record<string, string> = {
  delivered: 'bg-success/15 text-success',
  received: 'bg-primary/15 text-primary',
  sending: 'bg-warn/15 text-warn',
  queued: 'bg-muted text-ink-muted',
  failed: 'bg-destructive/15 text-destructive',
};

export default async function AdminFaxPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');

  const faxes = await prisma.faxMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      direction: true,
      toNumber: true,
      fromNumber: true,
      status: true,
      mediaName: true,
      mediaBase64: true,
      accessToken: true,
      pageCount: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  const fromConfigured = Boolean(process.env.TELNYX_FAX_FROM?.trim());
  const inbound = faxes.filter((f) => f.direction === 'INBOUND');
  const outbound = faxes.filter((f) => f.direction === 'OUTBOUND');

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <Printer className="h-5 w-5" />
          <h1 className="font-display text-2xl font-medium text-ink">Fax</h1>
        </div>
        <p className="text-sm text-ink-muted">
          Send a PDF by fax and review received faxes. Powered by Telnyx.
        </p>
        {!fromConfigured && (
          <div className="mt-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
            No Telnyx fax number is configured yet. Buy a fax-capable number in
            Telnyx, assign it to the fax application, and set{' '}
            <code>TELNYX_FAX_FROM</code> in Vercel to enable sending/receiving.
          </div>
        )}
      </header>

      <FaxSendForm disabled={!fromConfigured} />

      {/* Inbox tray */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-ink-muted" />
          <h2 className="font-semibold text-ink">Received ({inbound.length})</h2>
        </div>
        {inbound.length === 0 ? (
          <p className="text-sm text-ink-subtle">No received faxes yet.</p>
        ) : (
          <FaxTable rows={inbound} statusTone={STATUS_TONE} />
        )}
      </section>

      {/* Sent log */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-ink-muted" />
          <h2 className="font-semibold text-ink">Sent ({outbound.length})</h2>
        </div>
        {outbound.length === 0 ? (
          <p className="text-sm text-ink-subtle">No sent faxes yet.</p>
        ) : (
          <FaxTable rows={outbound} statusTone={STATUS_TONE} />
        )}
      </section>
    </div>
  );
}

function FaxTable({
  rows,
  statusTone,
}: {
  rows: Array<{
    id: string;
    direction: string;
    toNumber: string | null;
    fromNumber: string | null;
    status: string;
    mediaName: string | null;
    mediaBase64: string | null;
    accessToken: string | null;
    pageCount: number | null;
    errorMessage: string | null;
    createdAt: Date;
  }>;
  statusTone: Record<string, string>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-ink-subtle">
            <th className="px-4 py-2.5 font-semibold">When</th>
            <th className="px-4 py-2.5 font-semibold">Number</th>
            <th className="px-4 py-2.5 font-semibold">Document</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const isInbound = f.direction === 'INBOUND';
            const canView = Boolean(f.mediaBase64 && f.accessToken);
            return (
              <tr key={f.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">
                  <time dateTime={f.createdAt.toISOString()} suppressHydrationWarning>
                    {f.createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                  </time>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {isInbound ? <ArrowDownLeft className="h-3.5 w-3.5 text-primary" /> : <ArrowUpRight className="h-3.5 w-3.5 text-ink-subtle" />}
                    {isInbound ? f.fromNumber ?? '—' : f.toNumber ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {canView ? (
                    <a
                      href={`/api/admin/fax/media/${f.id}?t=${f.accessToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {f.mediaName ?? 'document.pdf'}
                    </a>
                  ) : (
                    <span className="text-ink-subtle">{f.mediaName ?? '—'}</span>
                  )}
                  {f.pageCount ? <span className="text-ink-subtle"> · {f.pageCount}p</span> : null}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[f.status] ?? 'bg-muted text-ink-muted'}`}>
                    {f.status}
                  </span>
                  {f.errorMessage && (
                    <p className="mt-1 text-xs text-destructive max-w-xs">{f.errorMessage}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
