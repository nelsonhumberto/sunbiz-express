'use client';

import { useState, useTransition } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { sendEmailBlast } from '@/actions/admin-email-blast';
import type { NotificationType } from '@/lib/email';

const EMAIL_TYPES: { value: NotificationType; label: string; desc: string }[] = [
  { value: 'WELCOME',           label: 'Welcome',            desc: 'Sent on sign-up' },
  { value: 'ABANDONED_24H',     label: 'Abandoned — 24h',    desc: 'Draft not completed after 24h' },
  { value: 'ABANDONED_72H',     label: 'Abandoned — 72h',    desc: 'Name reservation urgency' },
  { value: 'ABANDONED_7D',      label: 'Abandoned — 7 days', desc: 'Offer to help manually' },
  { value: 'RA_RENEWAL_60',     label: 'RA Renewal — 60d',   desc: 'Registered agent approaching renewal' },
  { value: 'RA_RENEWAL_30',     label: 'RA Renewal — 30d',   desc: 'Registered agent renewal reminder' },
  { value: 'RA_RENEWAL_7',      label: 'RA Renewal — 7d',    desc: 'Final registered agent notice' },
  { value: 'ANNUAL_REPORT_60',  label: 'Annual Report — 60d', desc: 'Annual report due in 60 days' },
  { value: 'ANNUAL_REPORT_30',  label: 'Annual Report — 30d', desc: 'Annual report due in 30 days' },
  { value: 'ANNUAL_REPORT_FINAL', label: 'Annual Report — Final', desc: 'Last warning before late fee' },
  { value: 'COMPLIANCE_ALERT',  label: 'Compliance Alert',   desc: 'Generic compliance notice' },
];

export default function AdminEmailBlastPage() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string; sent?: number } | null>(null);
  const [type, setType] = useState<NotificationType>('ABANDONED_24H');
  const [audience, setAudience] = useState('all');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await sendEmailBlast(fd);
      setResult(res);
    });
  }

  const selectedTemplate = EMAIL_TYPES.find((t) => t.value === type);

  return (
    <div className="container max-w-3xl py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Email blast</h1>
        <p className="mt-1 text-ink-muted">
          Send a transactional email template to one user or all active users.
          Every send is recorded in the Email outbox.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Template */}
            <div className="space-y-2">
              <Label htmlFor="type">Email template</Label>
              <select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as NotificationType)}
                className="w-full h-9 rounded-md border border-border bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {EMAIL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <p className="text-xs text-ink-muted">{selectedTemplate.desc}</p>
              )}
            </div>

            {/* Audience */}
            <div className="space-y-2">
              <Label htmlFor="audience">Recipients</Label>
              <select
                id="audience"
                name="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">All active users</option>
              </select>
              <p className="text-xs text-ink-muted">
                "All active users" excludes suspended accounts and admin accounts.
              </p>
            </div>

            {/* Warning */}
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This will send a real email to every recipient. Double-check the template and audience before sending.
              </span>
            </div>

            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send email
                </>
              )}
            </Button>
          </form>

          {result && (
            <div
              className={`rounded-md px-4 py-3 text-sm flex gap-2 ${
                result.ok
                  ? 'bg-success/10 border border-success/20 text-success'
                  : 'bg-destructive/10 border border-destructive/20 text-destructive'
              }`}
            >
              {result.ok ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  Successfully sent to {result.sent} recipient{result.sent !== 1 ? 's' : ''}.
                  Check the <a href="/admin/outbox" className="underline font-medium">Email outbox</a> to verify.
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {result.error}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template previews */}
      <div>
        <h2 className="text-lg font-semibold mb-3">All templates ({EMAIL_TYPES.length})</h2>
        <div className="space-y-2">
          {EMAIL_TYPES.map((t) => (
            <div
              key={t.value}
              onClick={() => setType(t.value)}
              className={`flex items-center justify-between px-4 py-3 rounded-md border cursor-pointer transition-colors ${
                type === t.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/30'
              }`}
            >
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-ink-muted">{t.desc}</p>
              </div>
              <code className="text-xs text-ink-subtle font-mono">{t.value}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
