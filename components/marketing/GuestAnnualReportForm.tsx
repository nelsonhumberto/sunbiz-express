'use client';

import { useState, useTransition, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  Search, Loader2, CheckCircle2, ChevronDown,
  Plus, Trash2, Shield, CreditCard, User, Check, X, Pencil, Building2,
} from 'lucide-react';
import { lookupEntityPublic, submitGuestAnnualReport, searchEntitiesByName, type EntitySearchHit } from '@/actions/annual-report';
import { floridaFilingEntityType, type GuestAnnualReportOffer } from '@/lib/guest-annual-report-offer';
import type { FloridaEntityDetail } from '@/lib/sunbiz';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import {
  ANNUAL_REPORT_SERVICE_FEE_CENTS,
  floridaEasternYear,
  RA_ANNUAL_SERVICE_FEE_CENTS,
} from '@/lib/pricing';
import { quoteAnnualReport } from '@/lib/annual-report-quote';

type Address = { street1: string; street2?: string; city: string; state: string; zip: string };
type Officer = { name: string; title: string };

function AddressForm({ value, onChange, label }: { value: Address; onChange: (a: Address) => void; label: string }) {
  const t = useTranslations('annualReportForm');
  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs font-medium text-ink-subtle uppercase tracking-wider">{label}</p>
      <Input placeholder={t('street')} value={value.street1} onChange={(e) => onChange({ ...value, street1: e.target.value })} />
      <Input placeholder={t('suite')} value={value.street2 ?? ''} onChange={(e) => onChange({ ...value, street2: e.target.value || undefined })} />
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder={t('city')} value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} className="col-span-1" />
        <Input placeholder={t('st')} value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase().slice(0, 2) })} className="uppercase" />
        <Input placeholder={t('zip')} value={value.zip} onChange={(e) => onChange({ ...value, zip: e.target.value })} />
      </div>
    </div>
  );
}

function SectionCard({ title, children, editing, onEdit, onSave, onCancel }: {
  title: string; children: React.ReactNode; editing: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void;
}) {
  const t = useTranslations('annualReportForm');
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {!editing
            ? <Button variant="outline" size="sm" onClick={onEdit} className="h-7 px-3 text-xs"><Pencil className="h-3 w-3 mr-1" /> {t('change')}</Button>
            : <div className="flex gap-2">
                <Button size="sm" onClick={onSave} className="h-7 px-3 text-xs"><Check className="h-3 w-3 mr-1" /> {t('save')}</Button>
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
  const t = useTranslations('annualReportForm');
  const [lookupPending, startLookup] = useTransition();
  const [searchPending, startSearch] = useTransition();
  const [submitPending, startSubmit] = useTransition();

  // ── Lookup state ──
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EntitySearchHit[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [detail, setDetail] = useState<FloridaEntityDetail | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<null | {
    kind: 'dissolved' | 'already_filed';
    name: string;
    nextOpenYear: number;
  }>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualDoc, setManualDoc] = useState('');
  const [manualType, setManualType] = useState<'LLC' | 'CORP'>('LLC');

  const isDocNumber = (q: string) => /^[A-Za-z]\d/.test(q.trim());

  const openManual = (documentNumber = '') => {
    setShowManual(true);
    if (documentNumber) setManualDoc(documentNumber);
  };

  const applyLookup = (found: FloridaEntityDetail, offer: GuestAnnualReportOffer, documentNumber: string) => {
    setShowManual(false);
    setLookupError('');
    setSearchError('');
    if (offer.kind === 'dissolved') {
      setDetail(null);
      setNotice({ kind: 'dissolved', name: found.corporation_name, nextOpenYear: 0 });
      setDocNumber(documentNumber);
      return;
    }
    if (offer.kind === 'already_filed') {
      setDetail(null);
      setNotice({
        kind: 'already_filed',
        name: found.corporation_name,
        nextOpenYear: offer.nextOpenYear,
      });
      setDocNumber(documentNumber);
      return;
    }
    setNotice(null);
    setDocNumber(documentNumber);
    populateForm(found);
  };

  const onSearch = () => {
    setSearchError('');
    setSearchResults(null);
    setNotice(null);
    const q = query.trim();
    if (!q) { setSearchError(t('searchEmpty')); return; }

    if (isDocNumber(q)) {
      // Treat as direct document number lookup
      startLookup(async () => {
        setLookupError('');
        const res = await lookupEntityPublic(q);
        if (!res.ok) {
          setLookupError(t('lookupFailed'));
          openManual(q);
          return;
        }
        applyLookup(res.detail, res.offer, q);
      });
      return;
    }

    // Name search → show result list, including inactive companies.
    startSearch(async () => {
      const res = await searchEntitiesByName(q, { includeInactive: true });
      if (!res.ok) {
        setSearchError(res.error === 'lookup_failed' ? t('lookupFailed') : res.error);
        openManual();
        return;
      }
      if (res.results.length === 0) {
        setSearchError(t('searchNone'));
        openManual();
        return;
      }
      setSearchResults(res.results);
    });
  };

  const onSelectResult = (hit: EntitySearchHit) => {
    setSearchResults(null);
    startLookup(async () => {
      setLookupError('');
      const res = await lookupEntityPublic(hit.documentNumber);
      if (!res.ok) {
        setLookupError(t('lookupFailed'));
        openManual(hit.documentNumber);
        return;
      }
      applyLookup(res.detail, res.offer, hit.documentNumber);
    });
  };

  const onManualContinue = () => {
    const name = manualName.trim();
    const doc = manualDoc.trim();
    if (name.length < 2 || doc.length < 5) {
      setLookupError(t('manualInvalid'));
      return;
    }
    setNotice(null);
    setShowManual(false);
    setLookupError('');
    setEntityType(manualType);
    setDocNumber(doc);
    setRaName('');
    setRaAddr({ street1: '', city: '', state: 'FL', zip: '' });
    setPrincipal({ street1: '', city: '', state: 'FL', zip: '' });
    setMailing({ street1: '', city: '', state: 'FL', zip: '' });
    setOfficers([]);
    setSigningOfficer('');
    setDetail({
      corporation_number: doc,
      corporation_name: name,
      filing_type: manualType === 'LLC' ? 'FLAL' : 'DOMP',
      filing_type_display: manualType === 'LLC'
        ? 'Florida Limited Liability Company'
        : 'Florida Profit Corporation',
      status: 'ACTIVE',
    });
  };

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
  const [cardholderName, setCardholderName] = useState('');

  const populateForm = (d: FloridaEntityDetail) => {
    setDetail(d);
    setEntityType(floridaFilingEntityType(d));
    setRaName(d.registered_agent?.name ?? '');
    setRaAddr(addrFrom(d.registered_agent?.address ?? undefined));
    setPrincipal(addrFrom(d.principal_address ?? undefined));
    setMailing(addrFrom(d.mailing_address ?? undefined));
    setOfficers((d.officers ?? []).map((o) => ({ name: o.name ?? '', title: o.title ?? 'MGR' })));
  };

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

  // Stripe
  const cardRef = useRef<StripeCardHandle>(null);

  // Same quote the payment route and the save action use.
  const now = new Date();
  const reportYear = floridaEasternYear(now);
  const quote = quoteAnnualReport('FL', entityType, useOurRa, reportYear, now);
  const totalCents = quote.totalCents;

  const onSubmit = () => {
    if (!signingOfficer) { toast.error(t('selectOfficer')); return; }
    if (!termsAccepted) { toast.error(t('acceptTerms')); return; }
    if (!guestEmail) { toast.error(t('emailRequired')); return; }
    if (!cardholderName.trim()) { toast.error(t('cardholderRequired')); return; }

    startSubmit(async () => {
      const doc = docNumber.trim();
      const attemptKey = `guest-ar-attempt:${doc}`;
      const piKey = `guest-ar-pi:${doc}`;
      let guestAttemptId: string | null = null;
      let openPaymentIntentId: string | null = null;
      try {
        guestAttemptId = sessionStorage.getItem(attemptKey);
        if (!guestAttemptId) {
          guestAttemptId = crypto.randomUUID();
          sessionStorage.setItem(attemptKey, guestAttemptId);
        }
        openPaymentIntentId = sessionStorage.getItem(piKey);
      } catch {
        guestAttemptId = guestAttemptId ?? crypto.randomUUID();
      }

      const stripeResult = await cardRef.current!.confirm({
        amountCents: totalCents,
        cardholderName,
        purpose: 'guest_annual_report',
        entityType,
        useOurRa,
        guestAttemptId: guestAttemptId ?? undefined,
        paymentIntentId: openPaymentIntentId ?? undefined,
        onPaymentIntent: (id) => {
          try {
            sessionStorage.setItem(piKey, id);
          } catch {
            // The server still reuses this attempt id for the same amount.
          }
        },
        metadata: { documentNumber: doc, guestEmail },
      });
      if ('error' in stripeResult) {
        if (stripeResult.paymentIntentId) {
          try {
            sessionStorage.setItem(piKey, stripeResult.paymentIntentId);
          } catch {
            // A later click can still reuse the attempt id.
          }
        }
        toast.error(stripeResult.error);
        return;
      }

      const res = await submitGuestAnnualReport({
        documentNumber: doc,
        guestEmail,
        companyName: detail!.corporation_name,
        entityType,
        ein: detail?.fei_number ?? undefined,
        registeredAgentName: raName,
        registeredAgentAddress: raAddr,
        useOurRa,
        principalAddress: principal,
        mailingAddress: mailing,
        officers,
        signingOfficerName: signingOfficer,
        termsAccepted: true,
        paymentIntentId: stripeResult.paymentIntentId,
      });

      if (!res.ok) { toast.error(res.error); return; }
      try {
        sessionStorage.removeItem(piKey);
      } catch {
        // The filing is saved. A leftover id is ignored once the payment exists.
      }
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
          <h2 className="font-display text-2xl font-medium">{t('successTitle')}</h2>
          <p className="text-sm text-ink-muted max-w-sm mx-auto">
            {t('successBefore', { year: reportYear })} <strong>{guestEmail}</strong>.
          </p>
          <p className="text-xs text-ink-subtle">
            {t('successCharged')} <strong>{formatCurrency(totalCents)}</strong>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (notice) {
    const reportYearShown = notice.nextOpenYear > 0 ? notice.nextOpenYear - 1 : reportYear;
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <h3 className="font-semibold text-ink">
            {notice.kind === 'dissolved'
              ? t('dissolvedTitle')
              : t('nothingDueTitle', { year: reportYearShown })}
          </h3>
          {notice.name ? <p className="text-sm font-medium text-ink">{notice.name}</p> : null}
          <p className="text-sm text-ink-muted">
            {notice.kind === 'dissolved'
              ? t('dissolvedBody')
              : t('nothingDue', { year: notice.nextOpenYear })}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNotice(null);
              setDetail(null);
              setDocNumber('');
            }}
          >
            {t('changeCompany')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Lookup step ──
  if (!detail) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-semibold text-ink">{t('findTitle')}</h3>
          <p className="text-sm text-ink-muted">
            {t('findBody')}
          </p>
          <div className="flex gap-2">
            <Input
              placeholder={t('placeholderQuery')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              autoFocus
            />
            <Button onClick={onSearch} disabled={lookupPending || searchPending}>
              {(lookupPending || searchPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              &nbsp;{t('search')}
            </Button>
          </div>

          {(searchError || lookupError) && (
            <p className="text-sm text-red-500">{searchError || lookupError}</p>
          )}

          {showManual && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h4 className="text-sm font-semibold text-ink">{t('manualTitle')}</h4>
                <p className="mt-1 text-sm text-ink-muted">{t('manualBody')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-company-name">{t('manualName')}</Label>
                <Input
                  id="manual-company-name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-document-number">{t('manualDoc')}</Label>
                <Input
                  id="manual-document-number"
                  value={manualDoc}
                  onChange={(e) => setManualDoc(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-entity-type">{t('manualEntity')}</Label>
                <select
                  id="manual-entity-type"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value === 'CORP' ? 'CORP' : 'LLC')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="LLC">LLC</option>
                  <option value="CORP">{t('corpLabel')}</option>
                </select>
              </div>
              <Button type="button" onClick={onManualContinue}>
                {t('manualContinue')}
              </Button>
            </div>
          )}

          {/* Name search results */}
          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                {t('selectCompany')}
              </p>
              <div className="divide-y divide-border rounded-lg border overflow-hidden">
                {searchResults.map((hit) => (
                  <button
                    key={hit.documentNumber}
                    type="button"
                    onClick={() => onSelectResult(hit)}
                    disabled={lookupPending}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-ink truncate">{hit.name}</p>
                      <p className="text-xs text-ink-muted font-mono">{hit.documentNumber}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted border border-border rounded-full px-2 py-0.5">
                        {hit.status.toUpperCase() === 'ACTIVE' || hit.status === 'A' ? t('active') : hit.status}
                      </span>
                      <Building2 className="h-4 w-4 text-ink-muted" />
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-subtle">
                {t('notListed')}
              </p>
            </div>
          )}
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
              <span>{t('stateId')} <span className="font-mono">{docNumber}</span></span>
              <span>{entityType === 'LLC' ? t('llcLabel') : t('corpLabel')}</span>
              {detail.status && <span>{t('status')} {detail.status}</span>}
            </div>
          </div>
          <Button variant="outline" size="sm"
            className="shrink-0 text-white border-white/30 hover:bg-white/10 hover:text-white text-xs"
            onClick={() => { setDetail(null); setDocNumber(''); }}>
            {t('changeCompany')}
          </Button>
        </CardContent>
      </Card>

      {/* Registered Agent */}
      <SectionCard title={t('raTitle')} editing={editRa}
        onEdit={() => { setDraftRaName(raName); setDraftRaAddr({ ...raAddr }); setEditRa(true); }}
        onSave={() => setEditRa(false)}
        onCancel={() => { setRaName(draftRaName); setRaAddr(draftRaAddr); setEditRa(false); }}>
        {editRa
          ? <div className="space-y-2"><Input placeholder={t('agentNamePh')} value={raName} onChange={(e) => setRaName(e.target.value)} /><AddressForm value={raAddr} onChange={setRaAddr} label={t('agentAddress')} /></div>
          : <div className="text-sm text-ink-muted"><p>{t('agentLabel')} <strong className="text-ink">{raName || '-'}</strong></p><p className="mt-1">{raAddr.street1 && `${raAddr.street1}, ${raAddr.city}, ${raAddr.state} ${raAddr.zip}`}</p></div>}

        <div className="mt-4 rounded-lg border border-border p-4 space-y-3">
          <div className="text-xs text-ink-muted bg-primary/5 rounded-md p-3 leading-relaxed">
            <p className="font-medium text-ink mb-1">{t('raPitchTitle')}</p>
            <p>{t('raPitchBefore')} <strong>{formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS)}{t('perYear')}</strong>{t('raPitchAfter')}</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>{t('raLi1')}</li>
              <li>{t('raLi2')}</li>
              <li>{t('raLi3')}</li>
            </ul>
          </div>
          <div className="flex items-center gap-2 font-medium text-sm text-ink">
            <Shield className="h-4 w-4 text-primary" />
            {t('raAsk')}
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="useOurRaGuest" checked={useOurRa} onChange={() => setUseOurRa(true)} className="accent-primary" />
              {t('raYes', { price: formatCurrency(RA_ANNUAL_SERVICE_FEE_CENTS) })}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="useOurRaGuest" checked={!useOurRa} onChange={() => setUseOurRa(false)} className="accent-primary" />
              {t('raNo')}
            </label>
          </div>
        </div>
      </SectionCard>

      {/* Physical Address */}
      <SectionCard title={t('physicalTitle')} editing={editPrincipal}
        onEdit={() => { setDraftPrincipal({ ...principal }); setEditPrincipal(true); }}
        onSave={() => setEditPrincipal(false)}
        onCancel={() => { setPrincipal(draftPrincipal); setEditPrincipal(false); }}>
        {editPrincipal
          ? <AddressForm value={principal} onChange={setPrincipal} label={t('physicalLabel')} />
          : <div className="text-sm text-ink-muted"><p>{principal.street1 || '-'}</p>{principal.city && <p>{principal.city}, {principal.state} {principal.zip}</p>}</div>}
      </SectionCard>

      {/* Mailing Address */}
      <SectionCard title={t('mailingTitle')} editing={editMailing}
        onEdit={() => { setDraftMailing({ ...mailing }); setEditMailing(true); }}
        onSave={() => setEditMailing(false)}
        onCancel={() => { setMailing(draftMailing); setEditMailing(false); }}>
        {editMailing
          ? <AddressForm value={mailing} onChange={setMailing} label={t('mailingLabel')} />
          : <div className="text-sm text-ink-muted"><p>{mailing.street1 || '-'}</p>{mailing.city && <p>{mailing.city}, {mailing.state} {mailing.zip}</p>}</div>}
      </SectionCard>

      {/* Officers */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">{t('officersTitle')}</h3>
            {!editOfficers && (
              <Button variant="outline" size="sm" className="h-7 px-3 text-xs"
                onClick={() => { setDraftOfficers(officers.map((o) => ({ ...o }))); setEditOfficers(true); }}>
                <Pencil className="h-3 w-3 mr-1" /> {t('change')}
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
                <Input placeholder={t('fullName')} value={newOfficerName} onChange={(e) => setNewOfficerName(e.target.value)} className="flex-1" />
                <select value={newOfficerTitle} onChange={(e) => setNewOfficerTitle(e.target.value)} className="border border-border rounded-md px-2 text-sm bg-background">
                  {['MGR','MGRM','AMBR','DIRECTOR','OFFICER','PRES','SEC','VP','CEO','CFO'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <Button type="button" size="sm" onClick={() => { if (!newOfficerName.trim()) return; setOfficers((p) => [...p, { name: newOfficerName.trim(), title: newOfficerTitle }]); setNewOfficerName(''); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setOfficers(draftOfficers); setEditOfficers(false); }}>{t('cancel')}</Button>
                <Button size="sm" onClick={() => setEditOfficers(false)}><Check className="h-3.5 w-3.5 mr-1" /> {t('done')}</Button>
              </div>
            </div>
          )}
          {!editOfficers && (
            <Button variant="outline" size="sm" className="w-full border-dashed text-ink-muted"
              onClick={() => { setDraftOfficers(officers.map((o) => ({ ...o }))); setEditOfficers(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {t('addOfficer')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Sign officer */}
      <Card className={!signingOfficer ? 'border-primary/40 ring-1 ring-primary/20' : ''}>
        <CardContent className="p-5 space-y-2">
          <h3 className="text-sm font-semibold text-ink">{t('signTitle')}</h3>
          <p className="text-xs text-ink-muted">{t('required')}</p>
          <div className="relative">
            <select value={signingOfficer} onChange={(e) => setSigningOfficer(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2.5 text-sm bg-background appearance-none pr-8">
              <option value="">{t('selectOfficerOption')}</option>
              {officers.map((o, i) => <option key={i} value={o.name}>{o.name} - {o.title}</option>)}
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
            <h3 className="text-sm font-semibold text-ink">{t('contactTitle')}</h3>
          </div>
          <div className="space-y-1.5">
            <Label>{t('emailLabel')}</Label>
            <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {/* Price breakdown */}
          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">{t('serviceFee')}</span><span>{formatCurrency(ANNUAL_REPORT_SERVICE_FEE_CENTS)}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">{t('stateFee', { entity: entityType })}</span><span>{formatCurrency(quote.filingFeeCents)}</span></div>
            {quote.lateFeeCents > 0 && (
              <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">{t('lateFee')}</span><span>{formatCurrency(quote.lateFeeCents)}</span></div>
            )}
            {quote.raFee > 0 && <div className="flex justify-between px-3 py-2"><span className="text-ink-muted">{t('raLine')}</span><span>{formatCurrency(quote.raFee)}</span></div>}
            <div className="flex justify-between px-3 py-2 font-semibold bg-muted/30"><span>{t('total')}</span><span>{formatCurrency(totalCents)}</span></div>
          </div>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>{t('cardName')}</Label><Input value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} autoComplete="cc-name" placeholder={t('cardNamePh')} /></div>
            <div className="space-y-1.5">
              <Label>{t('cardDetails')}</Label>
              <StripeCardInput ref={cardRef} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms + checkout */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 accent-primary h-4 w-4 shrink-0" />
            <p className="text-xs text-ink-muted leading-relaxed">
              {t('felony')}
            </p>
          </label>
          <Button type="button" className="w-full" size="lg" disabled={submitPending} onClick={onSubmit}>
            {submitPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('processing')}</> : t('submit', { total: formatCurrency(totalCents) })}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
