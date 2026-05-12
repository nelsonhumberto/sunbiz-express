'use client';

import { useState, useTransition, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2, Eye, Mail, PenLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { sendEmailBlast, sendCustomEmail } from '@/actions/admin-email-blast';
import type { NotificationType } from '@/lib/email';

const EMAIL_TYPES: { value: NotificationType; label: string; desc: string }[] = [
  { value: 'WELCOME',             label: 'Welcome',              desc: 'Sent on sign-up' },
  { value: 'ABANDONED_24H',       label: 'Abandoned — 24h',      desc: 'Draft not completed after 24h' },
  { value: 'ABANDONED_72H',       label: 'Abandoned — 72h',      desc: 'Name reservation urgency' },
  { value: 'ABANDONED_7D',        label: 'Abandoned — 7 days',   desc: 'Offer to help manually' },
  { value: 'RA_RENEWAL_60',       label: 'RA Renewal — 60d',     desc: 'Registered agent approaching renewal' },
  { value: 'RA_RENEWAL_30',       label: 'RA Renewal — 30d',     desc: 'Registered agent renewal reminder' },
  { value: 'RA_RENEWAL_7',        label: 'RA Renewal — 7d',      desc: 'Final registered agent notice' },
  { value: 'ANNUAL_REPORT_60',    label: 'Annual Report — 60d',  desc: 'Annual report due in 60 days' },
  { value: 'ANNUAL_REPORT_30',    label: 'Annual Report — 30d',  desc: 'Annual report due in 30 days' },
  { value: 'ANNUAL_REPORT_FINAL', label: 'Annual Report — Final', desc: 'Last warning before late fee' },
  { value: 'COMPLIANCE_ALERT',    label: 'Compliance Alert',     desc: 'Generic compliance notice' },
];

type Mode = 'template' | 'custom';
type Audience = 'all' | 'single';

export default function AdminEmailBlastPage() {
  const [mode, setMode] = useState<Mode>('template');

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Email blast</h1>
        <p className="mt-1 text-ink-muted">
          Send email templates or freeform messages. Every send is recorded in the Email outbox.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'template' ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={() => setMode('template')}
        >
          <Mail className="h-4 w-4" /> Template blast
        </Button>
        <Button
          variant={mode === 'custom' ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={() => setMode('custom')}
        >
          <PenLine className="h-4 w-4" /> Custom email
        </Button>
      </div>

      {mode === 'template' ? <TemplateBlast /> : <CustomEmail />}
    </div>
  );
}

// ─── Template blast ───────────────────────────────────────────────────────────

function TemplateBlast() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string; sent?: number } | null>(null);
  const [type, setType] = useState<NotificationType>('ABANDONED_24H');
  const [audience, setAudience] = useState<Audience>('all');
  const [singleEmail, setSingleEmail] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load preview whenever template changes
  useEffect(() => {
    setPreviewHtml(null);
    setPreviewLoading(true);
    fetch(`/api/email-preview?type=${type}`)
      .then((r) => r.text())
      .then((html) => { setPreviewHtml(html); setPreviewLoading(false); })
      .catch(() => setPreviewLoading(false));
  }, [type]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    if (audience === 'single') {
      fd.set('audience', `email:${singleEmail.trim().toLowerCase()}`);
    }
    startTransition(async () => {
      const res = await sendEmailBlast(fd);
      setResult(res);
    });
  }

  const selected = EMAIL_TYPES.find((t) => t.value === type);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: compose */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Template selector */}
            <div className="space-y-2">
              <Label>Email template</Label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border">
                {EMAIL_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                      type === t.value ? 'bg-primary/5 text-primary' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-ink-muted">{t.desc}</p>
                    </div>
                    {type === t.value && <Eye className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
              <input type="hidden" name="type" value={type} />
            </div>

            {/* Audience */}
            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAudience('all')}
                  className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                    audience === 'all' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-ink-muted hover:bg-muted/30'
                  }`}
                >
                  All active users
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('single')}
                  className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                    audience === 'single' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-ink-muted hover:bg-muted/30'
                  }`}
                >
                  One user
                </button>
              </div>
              <input type="hidden" name="audience" value={audience === 'all' ? 'all' : `email:${singleEmail}`} />

              {audience === 'single' && (
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={singleEmail}
                  onChange={(e) => setSingleEmail(e.target.value)}
                  required={audience === 'single'}
                />
              )}
              {audience === 'all' && (
                <p className="text-xs text-ink-muted">Excludes suspended and admin accounts.</p>
              )}
            </div>

            {audience === 'all' && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                This sends a real email to every active user. Review the preview first.
              </div>
            )}

            <Button type="submit" disabled={isPending || (audience === 'single' && !singleEmail.trim())} className="w-full gap-2">
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4" /> Send "{selected?.label}"</>}
            </Button>
          </form>

          {result && (
            <div className={`rounded-md px-4 py-3 text-sm flex gap-2 ${result.ok ? 'bg-success/10 border border-success/20 text-success' : 'bg-destructive/10 border border-destructive/20 text-destructive'}`}>
              {result.ok
                ? <><CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> Sent to {result.sent} recipient{result.sent !== 1 ? 's' : ''}. <a href="/admin/outbox" className="underline font-medium">View outbox →</a></>
                : <><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {result.error}</>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: live preview */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-ink-muted" />
            <span className="text-sm font-medium">Preview — {selected?.label}</span>
          </div>
          <div className="bg-muted/20 min-h-[500px] flex items-start justify-center p-4">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-ink-muted mt-16">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading preview…
              </div>
            ) : previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                sandbox="allow-same-origin"
                className="w-full min-h-[500px] bg-white rounded-md shadow-sm border border-border"
              />
            ) : (
              <p className="text-ink-muted text-sm mt-16">Select a template to preview it.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Custom / freeform email ──────────────────────────────────────────────────

function CustomEmail() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string; sent?: number } | null>(null);
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://launchforma.com';

  const previewHtml = body
    ? `<!doctype html><html><head><meta charset="utf-8"/><style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0F1F1C; background: #F8FAF9; }
        .muted { color: #8A9A95; font-size: 13px; }
      </style></head><body>
        <div style="text-align:center; padding-bottom:20px;">
          <span style="display:inline-flex; align-items:center; gap:10px; text-decoration:none;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; background:#0B7A6B; border-radius:9px; color:#fff; font-size:15px; font-weight:800;">LF</span>
            <span style="font-size:18px; font-weight:700; color:#0F1F1C;">LaunchForma</span>
          </span>
        </div>
        <div style="white-space:pre-wrap; line-height:1.7; color:#475A56;">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <hr style="border:none; border-top:1px solid #E5EBEA; margin:32px 0;"/>
        <p class="muted" style="text-align:center;">LaunchForma · <a href="mailto:help@launchforma.com" style="color:#8A9A95;">help@launchforma.com</a></p>
      </body></html>`
    : '';

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await sendCustomEmail(fd);
      setResult(res);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: compose */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="to">To (email address) *</Label>
              <Input id="to" name="to" type="email" placeholder="user@example.com" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject *</Label>
              <Input id="subject" name="subject" placeholder="Quick update from LaunchForma" required />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="body">Message *</Label>
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" /> {showPreview ? 'Hide' : 'Show'} preview
                </button>
              </div>
              <textarea
                id="body"
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                required
                placeholder="Write your message here. Plain text — line breaks are preserved."
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
              <p className="text-xs text-ink-muted">Plain text. Line breaks are preserved. No HTML needed.</p>
            </div>

            <Button type="submit" disabled={isPending} className="w-full gap-2">
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4" /> Send email</>}
            </Button>
          </form>

          {result && (
            <div className={`mt-4 rounded-md px-4 py-3 text-sm flex gap-2 ${result.ok ? 'bg-success/10 border border-success/20 text-success' : 'bg-destructive/10 border border-destructive/20 text-destructive'}`}>
              {result.ok
                ? <><CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> Email sent. <a href="/admin/outbox" className="underline font-medium">View outbox →</a></>
                : <><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {result.error}</>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: live preview */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-ink-muted" />
            <span className="text-sm font-medium">Live preview</span>
          </div>
          <div className="bg-muted/20 min-h-[500px] flex items-start justify-center p-4">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                sandbox="allow-same-origin"
                className="w-full min-h-[500px] bg-white rounded-md shadow-sm border border-border"
              />
            ) : (
              <p className="text-ink-muted text-sm mt-16">Start typing to see the preview.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
