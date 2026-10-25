'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Search } from 'lucide-react';
import { completeReinstatementOrder } from '@/actions/reinstatement';
import { lookupEntityPublic } from '@/actions/annual-report';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useRouter } from '@/i18n/navigation';
import type { FloridaEntityDetail } from '@/lib/sunbiz';
import {
  quoteReinstatement,
  ReinstatementQuoteError,
  reinstatementYearChoices,
} from '@/lib/reinstatement-quote';
import { formatCurrency } from '@/lib/utils';

function looksLikeCorporation(detail: FloridaEntityDetail): boolean {
  const type = `${detail.filing_type ?? ''} ${detail.filing_type_display ?? ''}`.toUpperCase();
  if (type.includes('LIMITED LIABILITY') || /\bLLC\b/.test(type) || type.includes('L.L.C')) return false;
  return type.includes('CORP') || type.includes('INC') || type.includes('PROFIT');
}

export function ReinstatementOrderForm() {
  const t = useTranslations('reinstateLlc');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const router = useRouter();
  const [lookupPending, startLookup] = useTransition();
  const [payPending, startPay] = useTransition();
  const cardRef = useRef<StripeCardHandle>(null);

  const [documentNumber, setDocumentNumber] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [status, setStatus] = useState('');
  const [isCorporation, setIsCorporation] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [officerName, setOfficerName] = useState('');
  const [officerTitle, setOfficerTitle] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [cardholderName, setCardholderName] = useState('');

  const yearChoices = useMemo(() => reinstatementYearChoices(), []);

  const quote = useMemo(() => {
    if (selectedYears.length === 0) return null;
    try {
      return quoteReinstatement({ years: selectedYears });
    } catch (err) {
      if (err instanceof ReinstatementQuoteError) return null;
      throw err;
    }
  }, [selectedYears]);

  const toggleYear = (year: number) => {
    setSelectedYears((current) =>
      current.includes(year) ? current.filter((item) => item !== year) : [...current, year].sort((a, b) => b - a),
    );
  };

  const onLookup = () => {
    const query = documentNumber.trim();
    if (query.length < 5) {
      setLookupError(t('lookupEmpty'));
      return;
    }
    setLookupError('');
    startLookup(async () => {
      const res = await lookupEntityPublic(query);
      setLookupAttempted(true);
      if (!res.ok) {
        setLookupError(t('lookupFailed'));
        setStatus('');
        setIsCorporation(false);
        return;
      }
      setCompanyName(res.detail.corporation_name ?? '');
      setStatus(res.detail.status ?? '');
      setIsCorporation(looksLikeCorporation(res.detail));
      if (res.detail.corporation_number) setDocumentNumber(res.detail.corporation_number);
    });
  };

  const onPay = () => {
    if (!companyName.trim()) { toast.error(t('companyRequired')); return; }
    if (selectedYears.length === 0 || !quote) { toast.error(t('yearsRequired')); return; }
    if (!contactName.trim() || !email.trim() || !phone.trim()) { toast.error(t('contactRequired')); return; }
    if (!officerName.trim() || !officerTitle.trim()) { toast.error(t('officerRequired')); return; }
    if (!termsAccepted) { toast.error(t('termsRequired')); return; }
    if (!cardholderName.trim()) { toast.error(t('cardholderRequired')); return; }
    if (isCorporation) { toast.error(t('corpBlocked')); return; }

    const payload = {
      type: 'reinstatement' as const,
      documentNumber: documentNumber.trim(),
      companyName: companyName.trim(),
      sunbizStatus: status,
      years: quote.years,
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      officerName: officerName.trim(),
      officerTitle: officerTitle.trim(),
      changeNote: changeNote.trim(),
      termsAccepted: true as const,
      locale,
      amountCents: quote.totalCents,
    };

    startPay(async () => {
      const stripeResult = await cardRef.current!.confirm({
        amountCents: quote.totalCents,
        cardholderName: cardholderName.trim(),
        intentPath: '/api/stripe/service-order',
        intentBody: payload,
      });
      if ('error' in stripeResult) { toast.error(stripeResult.error); return; }

      const saved = await completeReinstatementOrder({
        ...payload,
        paymentIntentId: stripeResult.paymentIntentId,
      });
      if (!saved.ok) { toast.error(saved.error); return; }
      router.push(`/reinstate-llc/confirmation?order=${saved.filingId}`);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc">{t('docLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="doc"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') onLookup(); }}
                placeholder={t('docPlaceholder')}
                autoComplete="off"
              />
              <Button type="button" onClick={onLookup} disabled={lookupPending}>
                {lookupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">{t('lookup')}</span>
              </Button>
            </div>
            <p className="text-xs text-ink-subtle">{t('docHelp')}</p>
            {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
          </div>

          {lookupAttempted && (
            <div className="space-y-1.5">
              <Label htmlFor="company">{t('companyName')}</Label>
              <Input id="company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              <p className="text-sm text-ink-muted">
                {t('status')}: {status || t('notConfirmed')}
              </p>
              {isCorporation && <p className="text-sm text-red-600">{t('corpBlocked')}</p>}
            </div>
          )}

          {!lookupAttempted && (
            <div className="space-y-1.5">
              <Label htmlFor="company-manual">{t('companyName')}</Label>
              <Input
                id="company-manual"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder={t('companyNamePh')}
              />
              <p className="text-xs text-ink-subtle">{t('companyHelp')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('yearsLabel')}</h2>
            <p className="text-xs text-ink-muted mt-1">{t('yearsHelp')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {yearChoices.map((year) => {
              const checked = selectedYears.includes(year);
              return (
                <label key={year} className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    checked={checked}
                    onChange={() => toggleYear(year)}
                  />
                  <span className="font-medium">{year}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="contact">{t('contactName')}</Label>
            <Input id="contact" value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="officer">{t('officerName')}</Label>
            <Input id="officer" value={officerName} onChange={(event) => setOfficerName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">{t('officerTitle')}</Label>
            <Input id="title" value={officerTitle} onChange={(event) => setOfficerTitle(event.target.value)} placeholder={t('officerTitlePh')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="changes">{t('changeNote')} <span className="text-ink-subtle font-normal">({t('optional')})</span></Label>
            <textarea
              id="changes"
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              placeholder={t('changeNotePh')}
              className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink">{t('totalTitle')}</h2>
          {quote ? (
            <div className="rounded-md border border-border divide-y divide-border text-sm">
              {quote.lines.map((line) => (
                <div key={line.id} className="flex justify-between gap-4 px-3 py-2">
                  <span className="text-ink-muted">
                    {line.kind === 'service' && t('serviceFee')}
                    {line.kind === 'reinstatement' && t('reinstatementFee')}
                    {line.kind === 'annual_report' && t('annualReportFee', { year: line.year ?? '' })}
                    {line.statePassThrough && (
                      <span className="block text-xs text-ink-subtle">{t('statePassThrough')}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatCurrency(line.cents)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 font-semibold bg-muted/30">
                <span>{t('total')}</span>
                <span className="tabular-nums">{formatCurrency(quote.totalCents)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t('selectYearsForTotal')}</p>
          )}
          <p className="text-xs text-ink-muted leading-relaxed">{t('sunbizAmountNote')}</p>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-name">{t('cardName')}</Label>
              <Input id="card-name" value={cardholderName} onChange={(event) => setCardholderName(event.target.value)} autoComplete="cc-name" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('cardDetails')}</Label>
              <StripeCardInput ref={cardRef} />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              className="mt-0.5 accent-primary h-4 w-4 shrink-0"
            />
            <span className="text-xs text-ink-muted leading-relaxed">{t('terms')}</span>
          </label>

          <Button type="button" className="w-full" size="lg" disabled={payPending || isCorporation || !quote} onClick={onPay}>
            {payPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('processing')}</>
            ) : quote ? (
              t('pay', { total: formatCurrency(quote.totalCents) })
            ) : (
              t('payNeedYears')
            )}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-ink-subtle flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        {t('manualFulfillment')}
      </p>
    </div>
  );
}
