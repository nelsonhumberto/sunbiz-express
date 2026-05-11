'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Link2,
  Loader2,
  Search,
  Building2,
  MapPin,
  User,
  Shield,
  CheckCircle2,
  PenLine,
} from 'lucide-react';
import {
  confirmLinkedEntity,
  manualConfirmLinkedEntity,
  previewLinkedEntity,
} from '@/actions/linked-entity';
import { searchEntitiesByName, type EntitySearchHit } from '@/actions/annual-report';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { FL } from '@/lib/florida';

const SUNBIZ_DOC_URL = FL.urls.searchByDocumentNumber;

type Preview = {
  documentNumber: string;
  name: string;
  entityType: 'LLC' | 'CORP';
  status: string | null | undefined;
  fileDate: string | null | undefined;
  principalCity: string | null;
  principalState: string | null;
  registeredAgentName: string | null;
  registeredAgentCountry: string | null;
  suggestRaUpsell: boolean;
};

export function AddCompanyForm() {
  const t = useTranslations('addCompany');
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EntitySearchHit[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [docInput, setDocInput] = useState('');
  const [legalNameInput, setLegalNameInput] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lookupPending, startLookup] = useTransition();
  const [searchPending, startSearch] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  // Manual entry fallback (when Sunbiz lookup fails)
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEntityType, setManualEntityType] = useState<'LLC' | 'CORP'>('LLC');

  const isDocNumber = (q: string) => /^[A-Za-z]\d/.test(q.trim());

  const onSearch = () => {
    setSearchError('');
    setSearchResults(null);
    const q = query.trim();
    if (!q || q.length < 2) { setSearchError(t('docTooShort')); return; }

    if (isDocNumber(q)) {
      // Treat as direct document number lookup
      setDocInput(q);
      setPreview(null);
      setShowManual(false);
      startLookup(async () => {
        const res = await previewLinkedEntity({
          documentNumber: q,
          legalNameHint: legalNameInput.trim() || undefined,
        });
        if (!res.ok) { toast.error(res.error); setShowManual(true); return; }
        setPreview(res.detail);
      });
      return;
    }

    // Name search → show result list
    startSearch(async () => {
      const res = await searchEntitiesByName(q);
      if (!res.ok) { setSearchError(res.error); return; }
      if (res.results.length === 0) {
        setSearchError('No active Florida companies found. Try a different spelling or enter the document number directly.');
        return;
      }
      setSearchResults(res.results);
    });
  };

  const onSelectResult = (hit: EntitySearchHit) => {
    setSearchResults(null);
    setDocInput(hit.documentNumber);
    setPreview(null);
    setShowManual(false);
    startLookup(async () => {
      const res = await previewLinkedEntity({ documentNumber: hit.documentNumber });
      if (!res.ok) { toast.error(res.error); setShowManual(true); return; }
      setPreview(res.detail);
    });
  };

  const onConfirm = () => {
    if (!preview) return;
    startConfirm(async () => {
      const res = await confirmLinkedEntity({
        documentNumber: preview.documentNumber,
        legalNameHint: legalNameInput.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('successToast'));
      router.push(`/dashboard/filings/${res.filingId}`);
    });
  };

  const onManualConfirm = () => {
    if (!manualName.trim()) {
      toast.error(t('manualNameRequired'));
      return;
    }
    if (docInput.trim().length < 5) {
      toast.error(t('docTooShort'));
      return;
    }
    startConfirm(async () => {
      const res = await manualConfirmLinkedEntity({
        documentNumber: docInput.trim(),
        companyName: manualName.trim(),
        entityType: manualEntityType,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t('successToast'));
      router.push(`/dashboard/filings/${res.filingId}`);
    });
  };

  return (
    <div className="space-y-8 max-w-xl">
      {/* ── Lookup card ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-medium">{t('lookupTitle')}</h2>
              <p className="text-sm text-ink-muted mt-1">
                Enter your company name or document number (e.g. L15000063512)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="query">Company name or document number</Label>
            <div className="flex gap-2">
              <Input
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                placeholder="e.g. My Company LLC or L15000063512"
                autoComplete="off"
              />
              <Button type="button" onClick={onSearch} disabled={lookupPending || searchPending}>
                {(lookupPending || searchPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">{t('lookup')}</span>
              </Button>
            </div>
          </div>

          {searchError && <p className="text-sm text-red-500">{searchError}</p>}

          {/* Name search results */}
          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Select your company
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
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                      Active
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-subtle">
                Don&apos;t see your company? Try a more specific name or enter the document number directly.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Info tip ──────────────────────────────────────────────── */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-5 text-sm text-ink-muted space-y-2">
          <p className="font-medium text-ink">{t('dataSourceTitle')}</p>
          <p>{t('dataSourceBody')}</p>
          <a
            href={SUNBIZ_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline inline-block"
          >
            {t('officialVerify')} ↗
          </a>
        </CardContent>
      </Card>

      {/* ── Preview + confirm ─────────────────────────────────────── */}
      {preview && (
        <Card className="border-primary/25">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-xl font-medium">{preview.name}</p>
                <p className="text-sm text-ink-muted font-mono mt-1">
                  #{preview.documentNumber} · {preview.entityType === 'LLC' ? 'LLC' : t('corpShort')}
                  {preview.status ? ` · ${preview.status}` : ''}
                </p>
              </div>
            </div>

            <ul className="text-sm text-ink-muted space-y-2">
              {preview.fileDate && (
                <li className="flex gap-2">
                  <span className="text-ink-subtle shrink-0">{t('filed')}</span>
                  {preview.fileDate}
                </li>
              )}
              {(preview.principalCity || preview.principalState) && (
                <li className="flex gap-2 items-start">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {[preview.principalCity, preview.principalState].filter(Boolean).join(', ')}
                  </span>
                </li>
              )}
              {preview.registeredAgentName && (
                <li className="flex gap-2 items-start">
                  <User className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {t('ra')}: {preview.registeredAgentName}
                    {preview.registeredAgentCountry ? ` · ${preview.registeredAgentCountry}` : ''}
                  </span>
                </li>
              )}
            </ul>

            {preview.suggestRaUpsell && (
              <div className="rounded-lg border border-warn/30 bg-warn-subtle/40 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-ink mb-1">
                  <Shield className="h-4 w-4 text-warn" />
                  {t('raUpsellTitle')}
                </div>
                <p className="text-ink-muted">{t('raUpsellBody')}</p>
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm text-ink-muted">{t('confirmHint')}</p>
              <Button
                type="button"
                className="w-full"
                size="lg"
                onClick={onConfirm}
                disabled={confirmPending}
              >
                {confirmPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {t('confirmAndAdd')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Manual fallback ───────────────────────────────────────── */}
      {showManual && !preview && (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center shrink-0">
                <PenLine className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-ink">{t('manualTitle')}</p>
                <p className="text-sm text-ink-muted mt-0.5">{t('manualHint')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manualName">{t('manualNameLabel')}</Label>
              <Input
                id="manualName"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder={t('manualNamePlaceholder')}
                className="uppercase"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('manualEntityTypeLabel')}</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setManualEntityType('LLC')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    manualEntityType === 'LLC'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  LLC
                </button>
                <button
                  type="button"
                  onClick={() => setManualEntityType('CORP')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    manualEntityType === 'CORP'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {t('corpShort')}
                </button>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={onManualConfirm}
              disabled={confirmPending}
            >
              {confirmPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {t('confirmAndAdd')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
