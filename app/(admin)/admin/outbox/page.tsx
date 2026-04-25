import { Mail } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TYPE_VARIANT: Record<string, 'default' | 'success' | 'warn' | 'accent'> = {
  WELCOME: 'accent',
  FILING_STARTED: 'default',
  ABANDONED_24H: 'warn',
  ABANDONED_72H: 'warn',
  PAYMENT_CONFIRMATION: 'success',
  FILING_SUBMITTED: 'success',
  FILING_APPROVED: 'success',
  FILING_REJECTED: 'warn',
};

export default async function AdminOutboxPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const emails = await prisma.emailNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const selected = searchParams.id ? emails.find((e) => e.id === searchParams.id) : emails[0];

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Email outbox</h1>
        <p className="mt-1 text-ink-muted">
          Mock email log — every email "sent" by the system is recorded here for inspection.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {emails.length} emails
              </p>
            </div>
            <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {emails.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-ink-muted">
                  <Mail className="h-8 w-8 mx-auto mb-2 text-ink-subtle" />
                  No emails sent yet.
                </li>
              ) : (
                emails.map((email) => (
                  <li key={email.id}>
                    <a
                      href={`?id=${email.id}`}
                      className={`block px-4 py-3 hover:bg-muted/30 transition-colors ${
                        selected?.id === email.id ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <Badge
                          variant={TYPE_VARIANT[email.notificationType] ?? 'secondary'}
                          size="sm"
                        >
                          {email.notificationType}
                        </Badge>
                        <span className="text-xs text-ink-subtle shrink-0">
                          {formatRelative(email.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{email.subject}</p>
                      <p className="text-xs text-ink-subtle truncate">→ {email.recipientEmail}</p>
                    </a>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {selected ? (
              <>
                <div className="border-b border-border px-6 py-4">
                  <Badge variant="secondary" size="sm" className="mb-2">
                    {selected.notificationType}
                  </Badge>
                  <h2 className="font-display text-xl font-medium">{selected.subject}</h2>
                  <p className="text-xs text-ink-muted mt-1">
                    To: {selected.recipientEmail} · {formatRelative(selected.createdAt)}
                  </p>
                </div>
                <div className="bg-surface">
                  <iframe
                    srcDoc={selected.htmlBody}
                    title="Email preview"
                    sandbox=""
                    className="w-full min-h-[60vh] bg-white"
                  />
                </div>
              </>
            ) : (
              <div className="px-6 py-16 text-center text-ink-muted">
                <Mail className="h-10 w-10 mx-auto mb-3 text-ink-subtle" />
                <p>Select an email to preview its contents.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
