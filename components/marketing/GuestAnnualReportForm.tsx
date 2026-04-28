'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Search, Loader2, CheckCircle2, ChevronDown,
  Plus, Trash2, Shield, CreditCard, User, Check, X, Pencil,
} from 'lucide-react';
import { lookupEntityPublic, submitGuestAnnualReport } from '@/actions/annual-report';
import type { FloridaEntityDetail } from '@/lib/sunbiz';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS, RA_ANNUAL_SERVICE_FEE_CENTS } from '@/lib/pricing';
import { FL } from '@/lib/florida';

type Address = { street1: string; street2?: string; city: string; state: string; zip: string };
type Officer = { name: string; title: string };

function AddressForm({ value, onChange, label }: { value: Address; onChange: (a: Address) => void; label: string }) {
  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">{label}</p>
      <Input placeholder="Street address" value={value.street1} onChange={(e) => onChange({ ...value, street1: e.target.value })} />
      <Input placeholder="Suite / Apt (optional)" value={value.street2 ?? ''} onChange={(e) => onChange({ ...value, street2: e.target.value || undefined })} />
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="City" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} className="col-span-1" />
        <Input placeholder="ST" value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase().slice(0, 2) })} className="uppercase" />
        <Input placeholder="ZIP" value={value.zip} onChange={(e) => onChange({ ...value, zip: e.target.value })} />
      </div>
    </div>
  );
}

function SectionCard({ title, children, editing, onEdit, onSave, onCancel }: {
  title: string; children: React.ReactNode; editing: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {!editing
            ? <Button variant="outline" size="sm" onClick={onEdit} className="h-7 px-3 text-xs"><Pencil className="h-3 w-3 mr-1" /> CHANGE</Button>
            : <div className="flex gap-2">
                <Button size="sm" onClick={onSave} className="h-7 px-3 text-xs"><Check className="h-3 w-3 mr-1" /> Save</Button>
                <Button variant="outline" size="sm" onClick={onCancel} className="h-7 px-3 text-xs"><X className="h-3 w-3" /></Button>
              </div>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

type EntityDetail = FloridaEntityDetail;

function addrFrom(a?: { address_1?: string; city?: string; state?: string; zip?: string }): Address {
  return { street1: a?.address_1 ?? '', city: a?.city ?? '', state: a?.state ?? 'FL', zip: a?.zip ?? '' };
}

export function GuestAnnualReportForm() {
  const [lookupPending, startLookup] = useTransition();
  const [submitPending, startSubmit] = useTransition();

  const [docNumber, setDocNumber] = useState('');
  const [detail, setDetail] = useState<FloridaEntityDetail | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [done, setDone] = useState(false);

  // Form fields
  const [raName, setRaName] = useState('');
  const [raAddr, setRaAddr] = useState<Address>({ street1: '', city: '', state: 'FL', zip: '' });
  const [useOurRa, setUseOurRa] = useState(false);
  const [principal, setPrincipal] = useState<Address>({ street1: '', city: '', state: 'FL', zip: '' });
  const [mailing, setMailing] = useState<Address>({ street1: '', city: '', state: 'FL', zip: '' });
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [signingOfficer, setSigningOfficer] = useState('');
  const [entityType, setEntityType] = useState<'LLC' | 'CORP'>('LLC');
  const [guestEmail, setGuestEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Editing drafts
  const [editRa, setEditRa] = useState(false);
  const [editPrincipal, setEditPrincipal] = useState(false);
  const [editMailing, setEditMailing] = useState(false);
  const [editOfficers, setEditOfficers] = useState(false);
  const [draftRaName, setDraftRaName] = useState('');
  const [draftRaAddr, setDraftRaAddr] = useState<Address>({ street1: '', city: '', state: 'FL', zip: '' });
  const [draftPrincipal, setDraftPrincipal] = useState<Address>({ street1: '', city: '', state: 'FL', zip: '' });
  const [draftMailing, setDraftMailing] = useState<Address>({ street1: '', city: '', state: 'FL', zip: '' });
  const [draftOfficers, setDraftOfficers] = useState<Officer[]>([]);
  const [newOfficerName, setNewOfficerName] = useState('');
  const [newOfficerTitle, setNewOfficerTitle] = useState('MGR');

  // Payment
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const formatCard = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})/g, '$1 ').trim();

  const stateFee = entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp;
  const raAddon = useOurRa ? RA_ANNUAL_SERVICE_FEE_CENTS : 0;
  const totalCents = ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFee + raAddon;
  const reportYear = new Date().getFullYear();

  const onLookup = () => {
    setLookupError('');
    if (!docNumber.trim()) { setLookupError('Please enter a document number.'); return; }
    startLookup(async () => {
      const res = await lookupEntityPublic(docNumber.trim());
      if (!res.ok) { setLookupError(res.error); return; }
      const d = res.detail;
      setDetail(d);
      const isCorpType = d.filing_type?.toUpperCase().includes('CORP') || d.filing_type?.toUpperCase().includes('INC');
      setEntityType(isCorpType ? 'CORP' : 'LLC');
      setRaName(d.registered_agent?.name ?? '');
      setRaAddr(addrFrom(d.registered_agent?.address ?? undefined));
      setPrincipal(addrFrom(d.principal_address ?? undefined));
      setMailing(addrFrom(d.mailing_address ?? undefined));
      setOfficers((d.officers ?? []).map((o) => ({ name: o.name ?? '', title: o.title ?? 'MGR' })));
    });
  };

  const onSubmit = () => {
    if (!signingOfficer) { toast.error('Please select an officer to sign.'); return; }
    if (!termsAccepted) { toast.error('Please accept the terms.'); return; }
    if (!guestEmail) { toast.error('Email is required to receive your confirmation.'); return; }
    if (cardNumber.replace(/\s+/g, '').length < 13) { toast.error('Card number is too short.'); return; }
    if (!cardholderName.trim()) { toast.error('Cardholder name is required.'); return; }

    startSubmit(async () => {
      const res = await submitGuestAnnualReport({
        documentNumber: docNumber.trim(),
        guestEmail,
        companyName: detail!.corporation_name,
        entityType,
        reportYear,
        ein: detail?.fei_number ?? undefined,
        registeredAgentName: raName,
        registeredAgentAddress: raAddr,
        useOurRa,
        principalAddress: principal,
        mailingAddress: mailing,
        officers,
        signingOfficerName: signingOfficer,
        cardNumber,
        cardholderName,
        expMonth,
        expYear,
        cvc,
        zip: billingZip,
      });

      if (!res.ok) { toast.error(res.error); return; }
      setDone(true);
    });
  };

  // ── Success screen ──
  if (done) {
    return (
      <Card className="border-success/30 bg-success-subtle/20">
        <CardContent className="p-8 text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-medium">Annual report submitted!</h2>
          <p className="text-sm text-ink-muted max-w-sm mx-auto">
            Your {reportYear} Florida annual report has been filed. A confirmation will be sent to <strong>{guestEmail}</strong>.
          </p>
          <p className="text-xs text-ink-subtle">
            Total charged: <strong>{formatCurrency(totalCents)}</strong>
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Lookup step ──
  if (!detail) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-semibold text-ink">Enter your Florida document number</h3>
          <p className="text-sm text-ink-muted">
            Find it on your filed Articles or at{' '}
            <a href="https://search.sunbiz.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              search.sunbiz.org
            </a>.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. L15000063512"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && onLookup()}
              className="font-mono"
            />
            <Button onClick={onLookup} disabled={lookupPending}>
              {lookupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              &nbsp;Look up
            </Button>
          </div>
          {lookupError && <p className="text-sm text-red-500">{lookupError}</p>}
        </CardContent>
      </Card>
    );
  }

  // ── Filing form ──
  return (
    <div className="space-y-6">
      {/* Company header */}
      <Card className="bg-primary text-white border-0">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <User className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold">{detail.corporation_name}</p>
            <div className="flex flex-wrap gap-4 mt-1 text-sm text-white/80">
              <span>State ID: <span className="font-mono">{docNumber}</span></span>
              <span>{entityType === 'LLC' ? 'FLAL (LLC)' : 'Florida Corp'}</span>
              {detail.status && <span>Status: {detail.status}</span>}
            </div>
          </div>
          <Button variant="outline" size="sm"
            className="shrink-0 text-white border-white/30 hover:bg-white/10 hover:text-white text-xs"
            onClick={() => { setDetail(null); setDocNumber(''); }}>
            Change
          </Button>
        </CardContent>
      </Card>

      {/* Registered Agent */}
      <SectionCard title="Registered Agent" editing={editRa}
        onEdit={() => { setDraftRaName(raName); setDraftRaAddr({ ...raAddr }); setEditRa(true); }}
        onSave={() => setEditRa(false)}
        onCancel={() => { setRaName(draftRaName); setRaAddr(draftRaAddr); setEditRa(false); }}>
        {editRa
          ? <div className="space-y-2"><Input placeholder="Agent name" value={raName} onChange={(e) => setRaName(e.target.value)} /><AddressForm value={raAddr} onChange={setRaAddr} label="Agent address" /></div>
          : <div className="text-sm text-ink-muted"><p>Agent: <strong className="text-ink">{raName || '—'}</strong></p><p className="mt-1">{raAddr.street1 && `${raAddr.street1}, ${raAddr.city}, ${raAddr.state} ${raAddr.zip}`}</p></div>}

        <div className="mt-4 rounded-lg border border-border p-4 space-y-3">
          <div className="text-xs text-ink-muted bg-primary/5 rounded-md p-3 leading-relaxed">
            <p className="font-medium text-ink mb-1">You&apos;re already here — why not let us take this burden off your busy plate?</p>
            <p>For just <strong>{formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS)}/year</strong>, our Registered Agent Service ensures you:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>Never miss a notice from the state</li>
              <li>Have documents handled quickly and securely</li>
              <li>Protect your privacy and free up your time</li>
            </ul>
          </div>
          <div className="flex items-center gap-2 font-medium text-sm text-ink">
            <Shield className="h-4 w-4 text-primary" />
            Would you like us to be your Registered Agent?
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="useOurRaGuest" checked={useOurRa} onChange={() => setUseOurRa(true)} className="accent-primary" />
              Yes, add for {formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS)}/yr
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="useOurRaGuest" checked={!useOurRa} onChange={() => setUseOurRa(false)} className="accent-primary" />
              No thanks
            </label>
          </div>
        </div>
      </SectionCard>

      {/* Physical Address */}
      <SectionCard title="Company Physical Address" editing={editPrincipal}
        onEdit={() => { setDraftPrincipal({ ...principal }); setEditPrincipal(true); }}
        onSave={() => setEditPrincipal(false)}
        onCancel={() => { setPrincipal(draftPrincipal); setEditPrincipal(false); }}>
        {editPrincipal
          ? <AddressForm value={principal} onChange={setPrincipal} label="Physical address" />
          : <div className="text-sm text-ink-muted"><p>{principal.street1 || '—'}</p>{principal.city && <p>{principal.city}, {principal.state} {principal.zip}</p>}</div>}
      </SectionCard>

      {/* Mailing Address */}
      <SectionCard title="Company Mailing Address" editing={editMailing}
        onEdit={() => { setDraftMailing({ ...mailing }); setEditMailing(true); }}
        onSave={() => setEditMailing(false)}
        onCancel={() => { setMailing(draftMailing); setEditMailing(false); }}>
        {editMailing
          ? <AddressForm value={mailing} onChange={setMailing} label="Mailing address" />
          : <div className="text-sm text-ink-muted"><p>{mailing.street1 || '—'}</p>{mailing.city && <p>{mailing.city}, {mailing.state} {mailing.zip}</p>}</div>}
      </SectionCard>

      {/* Officers */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Officers Summary</h3>
            {!editOfficers && (
              <Button variant="outline" size="sm" className="h-7 px-3 text-xs"
                onClick={() => { setDraftOfficers(officers.map((o) => ({ ...o }))); setEditOfficers(true); }}>
                <Pencil className="h-3 w-3 mr-1" /> CHANGE
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border">
            {officers.map((o, i) => (
              <li key={i} className="flex items-center gap-2 py-2 text-sm">
                <User className="h-4 w-4 text-ink-subtle shrink-0" />
                <span className="flex-1 font-medium">{o.name}</span>
                <span className="text-xs text-ink-subtle uppercase">{o.title}</span>
                {editOfficers && (
                  <button type="button" onClick={() => setOfficers((p) => p.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editOfficers && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Full name" value={newOfficerName} onChange={(e) => setNewOfficerName(e.target.value)} className="flex-1" />
                <select value={newOfficerTitle} onChange={(e) => setNewOfficerTitle(e.target.value)} className="border border-border rounded-md px-2 text-sm bg-background">
                  {['MGR','MGRM','AMBR','DIRECTOR','OFFICER','PRES','SEC','VP','CEO','CFO'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <Button type="button" size="sm" onClick={() => { if (!newOfficerName.trim()) return; setOfficers((p) => [...p, { name: newOfficerName.trim(), title: newOfficerTitle }]); setNewOfficerName(''); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setOfficers(draftOfficers); setEditOfficers(false); }}>Cancel</Button>
                <Button size="sm" onClick={() => setEditOfficers(false)}><Check className="h-3.5 w-3.5 mr-1" /> Done</Button>
              </div>
            </div>
          )}
          {!editOfficers && (
            <Button variant="outline" size="sm" className="w-full border-dashed text-ink-muted"
              onClick={() => { setDraftOfficers(officers.map((o) => ({ ...o }))); setEditOfficers(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> ADD OFFICER
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Sign officer */}
      <Card className={!signingOfficer ? 'border-primary/40 ring-1 ring-primary/20' : ''}>
        <CardContent className="p-5 space-y-2">
          <h3 className="text-sm font-semibold text-ink">Select an Officer to Sign the Annual Report</h3>
          <p className="text-xs text-ink-muted">Required.</p>
          <div className="relative">
            <select value={signingOfficer} onChange={(e) => setSigningOfficer(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2.5 text-sm bg-background appearance-none pr-8">
              <option value="">Select officer from the list below</option>
              {officers.map((o, i) => <option key={i} value={o.name}>{o.name} — {o.title}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-ink-subtle pointer-events-none" />
          </div>
        </CardContent>
      </Card>

      {/* Email + payment */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">Contact & Payment</h3>
          </div>
          <div className="space-y-1.5">
            <Label>Your email (for confirmation)</Label>
            <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {/* Price breakdown */}
          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">Annual report service fee</span><span>{formatCurrency(ANNUAL_REPORT_SERVICE_FEE_CENTS)}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">Florida state filing fee ({entityType})</span><span>{formatCurrency(stateFee)}</span></div>
            {useOurRa && <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">Registered Agent (1 yr)</span><span>{formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS)}</span></div>}
            <div className="flex justify-between px-3 py-2 font-semibold bg-muted/30"><span>Total</span><span>{formatCurrency(totalCents)}</span></div>
          </div>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Card number</Label><Input value={cardNumber} onChange={(e) => setCardNumber(formatCard(e.target.value))} placeholder="4242 4242 4242 4242" autoComplete="cc-number" /></div>
            <div className="space-y-1.5"><Label>Name on card</Label><Input value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} autoComplete="cc-name" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5"><Label>MM</Label><Input value={expMonth} onChange={(e) => setExpMonth(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>YY</Label><Input value={expYear} onChange={(e) => setExpYear(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>CVC</Label><Input value={cvc} onChange={(e) => setCvc(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Billing ZIP</Label><Input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Terms + checkout */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 accent-primary h-4 w-4 shrink-0" />
            <p className="text-xs text-ink-muted leading-relaxed">
              I certify that I am an authorized representative and that all information is true and accurate. I authorize IncServices to file this annual report with the Florida Division of Corporations on my behalf. Submitting false information constitutes a third degree felony.
            </p>
          </label>
          <Button type="button" className="w-full" size="lg" disabled={submitPending} onClick={onSubmit}>
            {submitPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</> : `Submit & Pay — ${formatCurrency(totalCents)}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
