'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Pencil, Check, X, Plus, Trash2, Loader2, Shield,
  ChevronDown, User, CreditCard,
} from 'lucide-react';
import { submitAnnualReport } from '@/actions/annual-report';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS, RA_ANNUAL_SERVICE_FEE_CENTS } from '@/lib/pricing';
import { FL } from '@/lib/florida';

// ── Types ──────────────────────────────────────────────────────────────────

type Address = {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
};

type Officer = { id?: string; name: string; title: string };

export type SavedCard = { last4: string; brand: string; cardholderName: string; paymentMethodId?: string };

export type AnnualReportFormProps = {
  filingId: string;
  annualReportId: string;
  reportYear: number;
  companyName: string;
  entityType: 'LLC' | 'CORP';
  documentNumber: string | null;
  ein: string | null;
  registeredAgentName: string;
  registeredAgentAddress: Address;
  principalAddress: Address;
  mailingAddress: Address;
  officers: Officer[];
  raIsOurs: boolean;
  savedCard: SavedCard | null;
};

// ── Small helpers ──────────────────────────────────────────────────────────

function AddressDisplay({ addr }: { addr: Address }) {
  return (
    <div className="text-sm text-ink-muted leading-snug">
      <div>{addr.street1}{addr.street2 ? `, ${addr.street2}` : ''}</div>
      <div>{addr.city}, {addr.state} {addr.zip}</div>
    </div>
  );
}

function AddressForm({ value, onChange, label }: { value: Address; onChange: (a: Address) => void; label: string }) {
  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">{label}</p>
      <Input placeholder="Street address" value={value.street1}
        onChange={(e) => onChange({ ...value, street1: e.target.value })} />
      <Input placeholder="Suite / Apt (optional)" value={value.street2 ?? ''}
        onChange={(e) => onChange({ ...value, street2: e.target.value || undefined })} />
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="City" value={value.city}
          onChange={(e) => onChange({ ...value, city: e.target.value })} className="col-span-1" />
        <Input placeholder="ST" value={value.state}
          onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase().slice(0, 2) })}
          className="uppercase" />
        <Input placeholder="ZIP" value={value.zip}
          onChange={(e) => onChange({ ...value, zip: e.target.value })} />
      </div>
    </div>
  );
}

function SectionCard({ title, children, editing, onEdit, onSave, onCancel, canEdit = true }: {
  title: string; children: React.ReactNode; editing: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void; canEdit?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={onEdit} className="h-7 px-3 text-xs">
              <Pencil className="h-3 w-3 mr-1" /> CHANGE
            </Button>
          )}
          {editing && (
            <div className="flex gap-2">
              <Button size="sm" onClick={onSave} className="h-7 px-3 text-xs">
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button variant="outline" size="sm" onClick={onCancel} className="h-7 px-3 text-xs">
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────

export function AnnualReportForm(props: AnnualReportFormProps) {
  const t = useTranslations('annualReport');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const stateFee = props.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp;

  // ── Field state ──
  const [ein, setEin] = useState(props.ein ?? '');
  const [raName, setRaName] = useState(props.registeredAgentName);
  const [raAddr, setRaAddr] = useState<Address>(props.registeredAgentAddress);
  const [useOurRa, setUseOurRa] = useState(props.raIsOurs);
  const [principal, setPrincipal] = useState<Address>(props.principalAddress);
  const [mailing, setMailing] = useState<Address>(props.mailingAddress);
  const [officers, setOfficers] = useState<Officer[]>(props.officers);
  const [signingOfficer, setSigningOfficer] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ── Edit mode ──
  const [editEin, setEditEin] = useState(false);
  const [editRa, setEditRa] = useState(false);
  const [editPrincipal, setEditPrincipal] = useState(false);
  const [editMailing, setEditMailing] = useState(false);
  const [editOfficers, setEditOfficers] = useState(false);
  const [draftEin, setDraftEin] = useState('');
  const [draftRaName, setDraftRaName] = useState('');
  const [draftRaAddr, setDraftRaAddr] = useState<Address>(props.registeredAgentAddress);
  const [draftPrincipal, setDraftPrincipal] = useState<Address>(props.principalAddress);
  const [draftMailing, setDraftMailing] = useState<Address>(props.mailingAddress);
  const [draftOfficers, setDraftOfficers] = useState<Officer[]>([]);
  const [newOfficerName, setNewOfficerName] = useState('');
  const [newOfficerTitle, setNewOfficerTitle] = useState('MGR');

  // ── Payment (Stripe) ──
  const hasSaved = !!props.savedCard;
  const [useSavedCard, setUseSavedCard] = useState(hasSaved);
  const [cardholderName, setCardholderName] = useState(
    hasSaved ? props.savedCard!.cardholderName : '',
  );
  const cardRef = useRef<StripeCardHandle>(null);

  // ── Dynamic total ──
  const raAddon = useOurRa ? RA_ANNUAL_SERVICE_FEE_CENTS : 0;
  const totalCents = ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFee + raAddon;

  // ── Submit validation ──
  const canSubmit =
    signingOfficer.length > 0 &&
    termsAccepted &&
    officers.length > 0 &&
    (useSavedCard || cardholderName.trim().length >= 2);

  const onSubmit = () => {
    if (!signingOfficer) { toast.error(t('selectOfficerRequired')); return; }
    if (!termsAccepted) { toast.error(t('termsRequired')); return; }
    if (!useSavedCard && !cardholderName.trim()) { toast.error(t('cardholderRequired')); return; }

    startTransition(async () => {
      // 1. Confirm payment with Stripe
      const stripeResult = await cardRef.current!.confirm({
        amountCents: totalCents,
        cardholderName: useSavedCard ? props.savedCard!.cardholderName : cardholderName,
        filingId: props.filingId,
        savedPaymentMethodId: useSavedCard ? props.savedCard!.paymentMethodId : undefined,
      });
      if ('error' in stripeResult) { toast.error(stripeResult.error); return; }

      // 2. Record the filing + payment server-side
      const res = await submitAnnualReport({
        filingId: props.filingId,
        annualReportId: props.annualReportId,
        ein: ein || undefined,
        registeredAgentName: raName,
        registeredAgentAddress: raAddr,
        useOurRa,
        principalAddress: principal,
        mailingAddress: mailing,
        officers,
        signingOfficerName: signingOfficer,
        paymentIntentId: stripeResult.paymentIntentId,
      });

      if (!res.ok) { toast.error(res.error); return; }
      toast.success(t('successToast'));
      router.push(`/dashboard/filings/${props.filingId}?filed=1`);
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Company header ── */}
      <Card className="bg-primary text-white border-0">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">{props.companyName}</p>
            <div className="flex gap-4 mt-1 text-sm text-white/80">
              <span>State ID: <span className="font-mono">{props.documentNumber ?? '—'}</span></span>
              <span>Entity Type: {props.entityType === 'LLC' ? 'FLAL (LLC)' : 'Corp'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── EIN ── */}
      <SectionCard title="Employer Identification Number" editing={editEin}
        onEdit={() => { setDraftEin(ein); setEditEin(true); }}
        onSave={() => setEditEin(false)}
        onCancel={() => { setEin(draftEin); setEditEin(false); }}>
        {editEin
          ? <Input value={ein} onChange={(e) => setEin(e.target.value)} placeholder="XX-XXXXXXX" className="font-mono max-w-xs" />
          : <p className="text-sm text-ink-muted font-mono">{ein || <span className="italic text-ink-subtle">Not provided</span>}</p>}
      </SectionCard>

      {/* ── Registered Agent ── */}
      <SectionCard title="Registered Agent" editing={editRa}
        onEdit={() => { setDraftRaName(raName); setDraftRaAddr({ ...raAddr }); setEditRa(true); }}
        onSave={() => setEditRa(false)}
        onCancel={() => { setRaName(draftRaName); setRaAddr(draftRaAddr); setEditRa(false); }}>
        {editRa
          ? <div className="space-y-2 pt-1">
              <Input placeholder="Agent name" value={raName} onChange={(e) => setRaName(e.target.value)} />
              <AddressForm value={raAddr} onChange={setRaAddr} label="Agent address" />
            </div>
          : <div className="text-sm text-ink-muted">
              <p>We have <strong className="text-ink">{raName}</strong> listed as your registered agent.</p>
              <p className="mt-1">{raAddr.street1}</p>
              <p>{raAddr.city}, {raAddr.state} {raAddr.zip}</p>
            </div>}

        {/* RA upsell — only when we are NOT already their agent */}
        {!props.raIsOurs && (
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
                <input type="radio" name="useOurRa" checked={useOurRa} onChange={() => setUseOurRa(true)} className="accent-primary" />
                Yes, add for {formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS)}/yr
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="useOurRa" checked={!useOurRa} onChange={() => setUseOurRa(false)} className="accent-primary" />
                No thanks
              </label>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Physical Address ── */}
      <SectionCard title="Company Physical Address" editing={editPrincipal}
        onEdit={() => { setDraftPrincipal({ ...principal }); setEditPrincipal(true); }}
        onSave={() => setEditPrincipal(false)}
        onCancel={() => { setPrincipal(draftPrincipal); setEditPrincipal(false); }}>
        {editPrincipal
          ? <AddressForm value={principal} onChange={setPrincipal} label="Physical address" />
          : <div className="text-sm text-ink-muted">
              <p>We have the following address listed as the company&apos;s physical address:</p>
              <div className="mt-2"><AddressDisplay addr={principal} /></div>
            </div>}
      </SectionCard>

      {/* ── Mailing Address ── */}
      <SectionCard title="Company Mailing Address" editing={editMailing}
        onEdit={() => { setDraftMailing({ ...mailing }); setEditMailing(true); }}
        onSave={() => setEditMailing(false)}
        onCancel={() => { setMailing(draftMailing); setEditMailing(false); }}>
        {editMailing
          ? <AddressForm value={mailing} onChange={setMailing} label="Mailing address" />
          : <div className="text-sm text-ink-muted">
              <p>We have the following address listed as the company&apos;s mailing address:</p>
              <div className="mt-2"><AddressDisplay addr={mailing} /></div>
            </div>}
      </SectionCard>

      {/* ── Officers ── */}
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
              <li key={o.id ?? i} className="flex items-center gap-2 py-2.5 text-sm">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <span className="flex-1 font-medium">{o.name}</span>
                <span className="text-ink-subtle text-xs uppercase tracking-wide">{o.title}</span>
                {editOfficers && (
                  <button type="button" onClick={() => setOfficers((prev) => prev.filter((_, j) => j !== i))}
                    className="text-red-500 hover:text-red-700 ml-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {editOfficers && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-ink-subtle">Add officer</p>
              <div className="flex gap-2">
                <Input placeholder="Full name" value={newOfficerName}
                  onChange={(e) => setNewOfficerName(e.target.value)} className="flex-1" />
                <select value={newOfficerTitle} onChange={(e) => setNewOfficerTitle(e.target.value)}
                  className="border border-border rounded-md px-2 text-sm bg-background">
                  {['MGR','MGRM','AMBR','DIRECTOR','OFFICER','PRES','SEC','VP','CEO','CFO'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Button type="button" size="sm" onClick={() => {
                  if (!newOfficerName.trim()) return;
                  setOfficers((prev) => [...prev, { name: newOfficerName.trim(), title: newOfficerTitle }]);
                  setNewOfficerName('');
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm"
                  onClick={() => { setOfficers(draftOfficers); setEditOfficers(false); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setEditOfficers(false)}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Done
                </Button>
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

      {/* ── Select signing officer (required) ── */}
      <Card className={!signingOfficer ? 'border-primary/40 ring-1 ring-primary/20' : ''}>
        <CardContent className="p-5 space-y-2">
          <h3 className="text-sm font-semibold text-ink">Select an Officer to Sign the Annual Report</h3>
          <p className="text-xs text-ink-muted">Required — the person submitting must be authorized to sign.</p>
          <div className="relative">
            <select value={signingOfficer} onChange={(e) => setSigningOfficer(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2.5 text-sm bg-background appearance-none pr-8">
              <option value="">Select officer from the list below</option>
              {officers.map((o, i) => (
                <option key={o.id ?? i} value={o.name}>{o.name} — {o.title}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-ink-subtle pointer-events-none" />
          </div>
        </CardContent>
      </Card>

      {/* ── Payment ── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">Payment</h3>
          </div>

          {/* Price breakdown */}
          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-ink-muted">Annual Report service fee ({props.reportYear})</span>
              <span>{formatCurrency(ANNUAL_REPORT_SERVICE_FEE_CENTS)}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-ink-muted">Florida state filing fee</span>
              <span>{formatCurrency(stateFee)}</span>
            </div>
            {useOurRa && (
              <div className="flex justify-between px-3 py-2">
                <span className="text-ink-muted">Registered Agent Service (1 year)</span>
                <span>{formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS)}</span>
              </div>
            )}
            <div className="flex justify-between px-3 py-2 font-semibold bg-muted/30">
              <span>Total</span>
              <span>{formatCurrency(totalCents)}</span>
            </div>
          </div>

          {/* Saved card option */}
          {hasSaved && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={useSavedCard} onChange={() => setUseSavedCard(true)} className="accent-primary" />
                <CreditCard className="h-4 w-4 text-ink-subtle" />
                Use saved card — {props.savedCard!.brand} ····{props.savedCard!.last4}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={!useSavedCard} onChange={() => setUseSavedCard(false)} className="accent-primary" />
                Use a different card
              </label>
            </div>
          )}

          {/* Stripe card element — hidden for saved card, shown for new card */}
          {!useSavedCard && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name on card</Label>
                <Input
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  autoComplete="cc-name"
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Card details</Label>
                <StripeCardInput ref={cardRef} />
              </div>
            </div>
          )}
          {/* Hidden Stripe ref for saved card confirm (no CardElement needed) */}
          {useSavedCard && <StripeCardInput ref={cardRef} showCardElement={false} />}
        </CardContent>
      </Card>

      {/* ── Terms + submit ── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 accent-primary h-4 w-4 shrink-0" />
            <p className="text-xs text-ink-muted leading-relaxed">
              By checking this box, I certify that I am an authorized representative empowered to file this annual report and that all information is true and accurate. I understand that IncServices will file this with the Florida Department of State on my behalf and that submitting false information constitutes a third degree felony.
            </p>
          </label>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()} className="flex-1">Back</Button>
            <Button type="button" className="flex-1" size="lg"
              disabled={!canSubmit || pending} onClick={onSubmit}>
              {pending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
                : `Checkout — ${formatCurrency(totalCents)}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
