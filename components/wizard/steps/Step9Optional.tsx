'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  CalendarRange,
  Coins,
  Clock,
  Copy,
  Globe,
  Lock,
  Mail,
  PieChart,
  Users,
} from 'lucide-react';
import { saveStep9 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, safeParseJson } from '@/lib/utils';
import { isValidEffectiveDate } from '@/lib/formation-validation';
import {
  FORMATION_STATES,
  defaultProcessingOption,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';
import type { AddOnSlug, TierSlug } from '@/lib/pricing';

function formatDollars(cents: number): string {
  if (cents === 0) return 'Included';
  return `$${(cents / 100).toFixed(2)}`;
}

interface ShareholderUi {
  name: string;
  street1?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  shares: number;
  /** S-corp election fields - collected only when election is in package. */
  taxIdType?: 'SSN' | 'EIN';
  /** Plaintext during the wizard session; encrypted server-side. */
  taxId?: string;
  taxYearEnd?: string;
  sCorpConsent?: boolean;
}

/** One LLC member's Form 2553 election data (LLC-S-corp only). */
interface MemberTaxUi {
  memberId: string;
  name: string;
  ownershipPercentage?: number | null;
  taxIdType: 'SSN' | 'EIN';
  /** Plaintext during the wizard session; encrypted server-side. */
  taxId: string;
  taxYearEnd: string;
  sCorpConsent: boolean;
  /** Last-4 mask of any Tax ID already on file (read-only display). */
  taxIdLast4?: string | null;
}

export function Step9Optional({ filing }: { filing: WizardFiling }) {
  const stored = safeParseJson<{
    effectiveDate?: string;
    authorizedShares?: number;
    parValueCents?: number;
    shareStructure?: {
      issuedShares?: number;
      sCorpElected?: boolean;
      shareholders?: Array<{
        name: string;
        street1?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        email?: string | null;
        shares?: number;
        taxIdType?: 'SSN' | 'EIN' | null;
        taxIdLast4?: string | null;
        taxYearEnd?: string | null;
        sCorpConsent?: boolean | null;
      }>;
    };
    memberTaxInfo?: Array<{
      memberId?: string | null;
      name: string;
      taxIdType?: 'SSN' | 'EIN' | null;
      taxIdLast4?: string | null;
      taxYearEnd?: string | null;
      sCorpConsent?: boolean | null;
      ownershipPercentage?: number | null;
    }>;
    professionalPurpose?: string;
    businessPurpose?: string;
    electronicServiceConsent?: boolean;
    organizerEmail?: string;
    processingOption?: string;
    foreignRegistrationInterest?: boolean;
  } | null>(filing.optionalDetails, null);

  const t = useTranslations('wizard');
  const stateCode = (filing.state ?? 'FL') as StateCode;
  const stateRule = FORMATION_STATES[stateCode] ?? FORMATION_STATES.FL;
  const isCorp = filing.entityType === 'CORP';

  // Whether S-corp election applies to this filing. It does when:
  //  - the customer chose the s_corp_election add-on, OR
  //  - they're on the Premium tier which bundles S-corp guidance.
  // Both surfaces drive the shareholder Tax-ID collection inside this step.
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const sCorpElected =
    filing.taxElection === 'S_CORP' || // authoritative Step-1 election
    addOnSlugs.includes('s_corp_election') ||
    (filing.serviceTier as TierSlug) === 'PREMIUM';

  const [effectiveDate, setEffectiveDate] = useState(stored?.effectiveDate?.slice(0, 10) ?? '');
  const [authorizedShares, setAuthorizedShares] = useState<number | ''>(
    stored?.authorizedShares ?? (isCorp ? 1500 : '')
  );
  // Default par value to $0.01 per share - the conventional low par value most
  // small corporations use (and what Delaware franchise-tax math expects).
  const [parValueCents, setParValueCents] = useState<number | ''>(stored?.parValueCents ?? 1);
  const [issuedShares, setIssuedShares] = useState<number | ''>(
    stored?.shareStructure?.issuedShares ?? (isCorp ? 1500 : ''),
  );
  const initialShareholders: ShareholderUi[] = useMemo(() => {
    const stored2 = stored?.shareStructure?.shareholders ?? [];
    if (stored2.length > 0) {
      return stored2.map((s) => ({
        name: s.name,
        street1: s.street1 ?? '',
        city: s.city ?? '',
        state: s.state ?? stateCode,
        zip: s.zip ?? '',
        email: s.email ?? '',
        shares: s.shares ?? 0,
        taxIdType: (s.taxIdType as 'SSN' | 'EIN') ?? 'SSN',
        // We never load encrypted Tax IDs back into the form - only the
        // last-4 mask is shown so the customer can confirm what's on file.
        taxId: '',
        taxYearEnd: s.taxYearEnd ?? '12/31',
        sCorpConsent: !!s.sCorpConsent,
      }));
    }
    // Default: one shareholder pre-populated from the first
    // director/officer, taking 100% of the issued shares.
    const seed = filing.managersMembers[0];
    return [
      {
        name: seed?.name ?? '',
        street1: seed?.street1 ?? '',
        city: seed?.city ?? '',
        state: seed?.state ?? stateCode,
        zip: seed?.zip ?? '',
        email: '',
        shares: stored?.authorizedShares ?? (isCorp ? 1500 : 0),
        taxIdType: 'SSN',
        taxId: '',
        taxYearEnd: '12/31',
        sCorpConsent: false,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [shareholders, setShareholders] = useState<ShareholderUi[]>(initialShareholders);

  // LLC electing S-corp: each member supplies Form 2553 data. Seed from the
  // member list, merging any previously-saved Tax-ID metadata (by id or name).
  const initialMemberTax: MemberTaxUi[] = useMemo(() => {
    if (isCorp) return [];
    const saved = stored?.memberTaxInfo ?? [];
    return filing.managersMembers.map((m) => {
      const prior = saved.find((s) => s.memberId === m.id || s.name === m.name);
      return {
        memberId: m.id,
        name: m.name,
        ownershipPercentage: m.ownershipPercentage ?? null,
        taxIdType: (prior?.taxIdType as 'SSN' | 'EIN') ?? 'SSN',
        taxId: '',
        taxYearEnd: prior?.taxYearEnd ?? '12/31',
        sCorpConsent: !!prior?.sCorpConsent,
        taxIdLast4: prior?.taxIdLast4 ?? null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [memberTax, setMemberTax] = useState<MemberTaxUi[]>(initialMemberTax);
  const updateMemberTax = (idx: number, patch: Partial<MemberTaxUi>) =>
    setMemberTax((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  const [shareholderCount, setShareholderCount] = useState<number>(
    initialShareholders.length || 1,
  );
  // Whether the shareholder-count picker is in free-entry ("Custom") mode.
  const [customShareholderCount, setCustomShareholderCount] = useState<boolean>(
    (initialShareholders.length || 1) > 8,
  );
  const [businessPurpose, setBusinessPurpose] = useState(stored?.businessPurpose ?? '');
  const [organizerEmail, setOrganizerEmail] = useState(stored?.organizerEmail ?? '');
  const [electronicServiceConsent, setElectronicServiceConsent] = useState(
    stored?.electronicServiceConsent ?? false,
  );
  // Processing speed selection - defaults to the state's default option
  // (typically "standard" / no extra fee). Only renders if the state offers
  // more than one option.
  const defaultOption = useMemo(() => defaultProcessingOption(stateRule), [stateRule]);
  const [processingOption, setProcessingOption] = useState<string>(
    stored?.processingOption ?? defaultOption.id,
  );
  const [foreignInterest, setForeignInterest] = useState<boolean>(
    stored?.foreignRegistrationInterest ?? false,
  );

  const [pending, start] = useTransition();
  const router = useRouter();

  let dateError: string | undefined;
  if (effectiveDate) {
    const v = isValidEffectiveDate(new Date(effectiveDate), stateCode);
    if (!v.valid) dateError = v.error;
  }

  const needsWyOrganizer = stateRule.quirks.requiresOrganizerEmail;
  const needsWyConsent = stateRule.quirks.requiresElectronicServiceConsent;
  const needsDeStock = stateRule.quirks.requiresParValueForCorp && isCorp;

  // ─── Share allocation math (CORP only) ────────────────────────────────
  const totalAllocated = isCorp
    ? shareholders.reduce((acc, s) => acc + (Number(s.shares) || 0), 0)
    : 0;
  const issuedNum = typeof issuedShares === 'number' ? issuedShares : 0;
  const authorizedNum = typeof authorizedShares === 'number' ? authorizedShares : 0;
  const allocationExceedsAuthorized = isCorp && issuedNum > authorizedNum && authorizedNum > 0;
  const allocationMatches = isCorp ? totalAllocated === issuedNum && issuedNum > 0 : true;
  const allShareholdersNamed = isCorp
    ? shareholders.every((s) => s.name.trim().length > 0)
    : true;
  const sCorpConsentsOk =
    !isCorp || !sCorpElected || shareholders.every((s) => s.sCorpConsent);
  const sCorpTaxIdsOk =
    !isCorp ||
    !sCorpElected ||
    shareholders.every((s) => /^\d{9}$/.test((s.taxId ?? '').replace(/\D/g, '')));

  const corpShareValid =
    !isCorp ||
    (authorizedNum >= 1 &&
      issuedNum >= 1 &&
      !allocationExceedsAuthorized &&
      allocationMatches &&
      allShareholdersNamed &&
      sCorpConsentsOk &&
      sCorpTaxIdsOk);

  // LLC electing S-corp: every member must consent and provide a valid Tax ID
  // (unless one is already on file, surfaced via the last-4 mask).
  const llcSCorpActive = !isCorp && sCorpElected;
  const llcSCorpValid =
    !llcSCorpActive ||
    memberTax.every(
      (m) =>
        m.sCorpConsent &&
        (/^\d{9}$/.test(m.taxId.replace(/\D/g, '')) || !!m.taxIdLast4),
    );

  const valid =
    !dateError &&
    corpShareValid &&
    llcSCorpValid &&
    (!needsWyOrganizer || (organizerEmail.trim().length > 0 && /@/.test(organizerEmail))) &&
    (!needsWyConsent || electronicServiceConsent);

  // ─── Shareholder helpers ──────────────────────────────────────────────
  const updateShareholder = (idx: number, patch: Partial<ShareholderUi>) =>
    setShareholders((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const resizeShareholders = (n: number) => {
    const next = Math.max(1, Math.min(100, Math.floor(n) || 1));
    setShareholderCount(next);
    setShareholders((prev) => {
      if (prev.length === next) return prev;
      if (prev.length < next) {
        const additions: ShareholderUi[] = Array.from({ length: next - prev.length }, () => ({
          name: '',
          street1: '',
          city: '',
          state: stateCode,
          zip: '',
          email: '',
          shares: 0,
          taxIdType: 'SSN',
          taxId: '',
          taxYearEnd: '12/31',
          sCorpConsent: false,
        }));
        return [...prev, ...additions];
      }
      return prev.slice(0, next);
    });
  };

  const splitEvenly = () => {
    const total = typeof issuedShares === 'number' ? issuedShares : 0;
    const n = shareholders.length;
    if (total === 0 || n === 0) return;
    const base = Math.floor(total / n);
    const remainder = total - base * n;
    setShareholders((prev) =>
      prev.map((s, i) => ({ ...s, shares: base + (i < remainder ? 1 : 0) })),
    );
  };

  const resetAllocations = () =>
    setShareholders((prev) => prev.map((s) => ({ ...s, shares: 0 })));

  // Fill from existing director/officer profile (one-click ergonomics).
  const fillFromOfficer = (idx: number, m: typeof filing.managersMembers[number]) => {
    updateShareholder(idx, {
      name: m.name,
      street1: m.street1 ?? '',
      city: m.city ?? '',
      state: m.state ?? stateCode,
      zip: m.zip ?? '',
    });
  };

  // Surface a soft warning when DE corp's authorized shares would push the
  // filing above the launch-safe minimum fee tier.
  const deStockWarning =
    needsDeStock && typeof authorizedShares === 'number' && authorizedShares > 1500
      ? "Heads up: Delaware's corporation filing fee can rise above the standard $109 when authorized shares exceed 1,500 with no par value. Our team will review and confirm the exact fee before submission."
      : null;

  const onContinue = () => {
    if (llcSCorpActive && !llcSCorpValid) {
      toast.error(
        'Each member must consent and provide a valid 9-digit Tax ID for the S-Corp election.',
      );
      return;
    }
    if (isCorp && !corpShareValid) {
      if (allocationExceedsAuthorized) {
        toast.error(
          `Issued shares (${issuedNum}) cannot exceed authorized shares (${authorizedNum}).`,
        );
      } else if (!allocationMatches) {
        toast.error(
          `Shareholder allocations (${totalAllocated}) must add up to issued shares (${issuedNum}).`,
        );
      } else if (!allShareholdersNamed) {
        toast.error('Each shareholder needs a name.');
      } else if (!sCorpConsentsOk) {
        toast.error('Each shareholder must consent to the S-Corp election.');
      } else if (!sCorpTaxIdsOk) {
        toast.error('Each shareholder must provide a valid 9-digit Tax ID for the S-Corp election.');
      }
      return;
    }
    start(async () => {
      const res = await saveStep9({
        filingId: filing.id,
        effectiveDate: effectiveDate || undefined,
        authorizedShares:
          isCorp && typeof authorizedShares === 'number' ? authorizedShares : undefined,
        parValueCents: needsDeStock && typeof parValueCents === 'number' ? parValueCents : undefined,
        shareStructure: isCorp
          ? {
              issuedShares: typeof issuedShares === 'number' ? issuedShares : 0,
              shareholders: shareholders.map((s) => ({
                name: s.name,
                street1: s.street1,
                city: s.city,
                state: s.state,
                zip: s.zip,
                email: s.email,
                shares: s.shares,
                taxIdType: sCorpElected ? s.taxIdType : undefined,
                taxId: sCorpElected ? s.taxId : undefined,
                taxYearEnd: sCorpElected ? s.taxYearEnd : undefined,
                sCorpConsent: sCorpElected ? !!s.sCorpConsent : undefined,
              })),
            }
          : undefined,
        memberTaxInfo: llcSCorpActive
          ? memberTax.map((m) => ({
              memberId: m.memberId,
              name: m.name,
              taxIdType: m.taxIdType,
              taxId: m.taxId || undefined,
              taxYearEnd: m.taxYearEnd,
              sCorpConsent: m.sCorpConsent,
              ownershipPercentage: m.ownershipPercentage ?? undefined,
            }))
          : undefined,
        businessPurpose: businessPurpose || undefined,
        electronicServiceConsent: needsWyConsent ? electronicServiceConsent : undefined,
        organizerEmail: needsWyOrganizer ? organizerEmail : undefined,
        processingOption,
        foreignRegistrationInterest: foreignInterest,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/9`);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-white p-5 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="effectiveDate" className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Effective date <span className="text-ink-subtle font-normal">(optional)</span>
          </Label>
          <Input
            id="effectiveDate"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="max-w-xs"
          />
          {dateError ? (
            <p className="text-xs text-destructive">{dateError}</p>
          ) : (
            <p className="text-xs text-ink-muted">
              {stateCode === 'FL'
                ? "Florida lets you backdate up to 5 business days or schedule up to 90 days in the future. Leave blank to use the date Florida processes the filing."
                : `${stateRule.name} accepts effective dates up to ${stateRule.effectiveDate.maxDaysForward} days in the future. Leave blank to use the date ${stateRule.name} processes the filing.`}
              {stateCode === 'FL' && (
                <>
                  <br />
                  <strong>Tip:</strong> If forming Oct 1 – Dec 31, set the effective date to January 1
                  of next year - you'll skip a full year of annual reports.
                </>
              )}
            </p>
          )}
        </div>

        {/* Corporation share / shareholder structure. Combines authorized
            shares + par value + issued shares + shareholder allocation
            into one cohesive section. For Delaware we still surface the
            par-value warning since the franchise tax depends on it. */}
        {isCorp && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-ink">{t('shareStructureHeader')}</h3>
                <p className="text-xs text-ink-muted mt-0.5">{t('shareStructureBody')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="shares">
                  {t('authorizedSharesLabel')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="shares"
                  type="number"
                  min={1}
                  value={authorizedShares}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : '';
                    setAuthorizedShares(v);
                  }}
                />
                <p className="text-[11px] text-ink-muted leading-snug">
                  {t('authorizedSharesHelp')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issued">
                  {t('issuedSharesLabel')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="issued"
                  type="number"
                  min={1}
                  value={issuedShares}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : '';
                    setIssuedShares(v);
                    // Keep the single-holder case auto-allocated so users
                    // who only have one shareholder never see "under-
                    // allocated" warnings.
                    if (shareholders.length === 1 && typeof v === 'number') {
                      updateShareholder(0, { shares: v });
                    }
                  }}
                />
                <p className="text-[11px] text-ink-muted leading-snug">
                  {t('issuedSharesHelp')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="parValue" className="flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5" /> {t('parValueLabel')}
                </Label>
                <Input
                  id="parValue"
                  type="number"
                  step="0.0001"
                  min={0}
                  value={
                    typeof parValueCents === 'number' ? (parValueCents / 100).toString() : ''
                  }
                  onChange={(e) => {
                    const dollars = e.target.value ? parseFloat(e.target.value) : 0;
                    setParValueCents(Math.round(dollars * 100));
                  }}
                />
                <p className="text-[11px] text-ink-muted leading-snug">{t('parValueHelp')}</p>
              </div>
            </div>

            {allocationExceedsAuthorized && (
              <p className="text-xs text-destructive">
                {t('shareAllocationExceedsAuthorized', {
                  issued: issuedNum,
                  authorized: authorizedNum,
                })}
              </p>
            )}
            {deStockWarning && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {deStockWarning}
              </p>
            )}

            {/* Shareholder count + allocation toolbar */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-ink text-sm">{t('shareholdersHeader')}</h4>
                  <p className="text-xs text-ink-muted mt-0.5">{t('shareholdersBody')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="shCount">{t('shareholderCountLabel')}</Label>
                  <Select
                    value={
                      shareholderCount <= 8 && !customShareholderCount
                        ? String(shareholderCount)
                        : 'custom'
                    }
                    onValueChange={(v) => {
                      if (v === 'custom') {
                        setCustomShareholderCount(true);
                        return;
                      }
                      setCustomShareholderCount(false);
                      resizeShareholders(parseInt(v, 10));
                    }}
                  >
                    <SelectTrigger id="shCount">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">{t('shareholderCountCustom')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {customShareholderCount && (
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={shareholderCount}
                      onChange={(e) =>
                        resizeShareholders(e.target.value ? parseInt(e.target.value, 10) : 1)
                      }
                      placeholder={t('shareholderCountLabel')}
                      className="mt-2"
                    />
                  )}
                </div>
                <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={splitEvenly}
                    className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
                  >
                    {t('shareholderSplitEvenly')}
                  </button>
                  <button
                    type="button"
                    onClick={resetAllocations}
                    className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-warn/40 hover:bg-warn-subtle/50 hover:text-warn transition-colors"
                  >
                    {t('shareholderResetAllocations')}
                  </button>
                </div>
              </div>

              {/* Allocation status */}
              {issuedNum > 0 && (
                <p
                  className={cn(
                    'text-xs leading-snug',
                    allocationMatches
                      ? 'text-success'
                      : totalAllocated > issuedNum
                        ? 'text-destructive'
                        : 'text-warn',
                  )}
                >
                  {allocationMatches
                    ? t('shareAllocationOk', { issued: issuedNum })
                    : totalAllocated > issuedNum
                      ? t('shareAllocationOver', {
                          allocated: totalAllocated,
                          issued: issuedNum,
                        })
                      : t('shareAllocationUnder', {
                          allocated: totalAllocated,
                          remaining: issuedNum - totalAllocated,
                        })}
                </p>
              )}

              {/* Shareholder cards */}
              <div className="space-y-3">
                {shareholders.map((sh, idx) => {
                  const officerChips = filing.managersMembers.filter((m) => m.name.trim());
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-white p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                          {t('shareholderOrdinal', { idx: idx + 1 })}
                        </p>
                        {officerChips.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
                              <Copy className="h-3 w-3" />
                              {t('useExistingPerson')}
                            </span>
                            {officerChips.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => fillFromOfficer(idx, m)}
                                className="inline-flex items-center rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-ink-muted hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
                              >
                                {m.name} ({m.title})
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2 space-y-1.5">
                          <Label>{t('shareholderNameLabel')}</Label>
                          <Input
                            value={sh.name}
                            onChange={(e) => updateShareholder(idx, { name: e.target.value })}
                            placeholder={t('fullNamePlaceholder')}
                            autoComplete="name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t('shareholderSharesLabel')}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={sh.shares}
                            onChange={(e) =>
                              updateShareholder(idx, {
                                shares: e.target.value ? parseInt(e.target.value, 10) : 0,
                              })
                            }
                          />
                          {issuedNum > 0 && sh.shares > 0 && (
                            <p className="text-[11px] text-ink-muted">
                              {((sh.shares / issuedNum) * 100).toFixed(2)}%
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-6 gap-2">
                        <Input
                          className="col-span-6 md:col-span-3"
                          value={sh.street1 ?? ''}
                          onChange={(e) =>
                            updateShareholder(idx, { street1: e.target.value })
                          }
                          placeholder={t('streetAddressPlaceholder')}
                        />
                        <Input
                          className="col-span-3 md:col-span-1"
                          value={sh.city ?? ''}
                          onChange={(e) => updateShareholder(idx, { city: e.target.value })}
                          placeholder={t('cityPlaceholder')}
                        />
                        <Input
                          className="col-span-1"
                          value={sh.state ?? stateCode}
                          onChange={(e) =>
                            updateShareholder(idx, { state: e.target.value.toUpperCase() })
                          }
                          maxLength={2}
                          placeholder={stateCode}
                        />
                        <Input
                          className="col-span-2 md:col-span-1"
                          value={sh.zip ?? ''}
                          onChange={(e) => updateShareholder(idx, { zip: e.target.value })}
                          placeholder={t('zipPlaceholder')}
                          maxLength={10}
                        />
                      </div>

                      {/* S-corp election fields - only when election is in the package. */}
                      {sCorpElected && (
                        <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
                          <div className="flex items-start gap-2">
                            <Lock className="h-3.5 w-3.5 text-primary mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-primary">
                                {t('scorpHeader')}
                              </p>
                              <p className="text-[11px] text-ink-muted leading-snug">
                                {t('scorpBody')}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <Label>{t('scorpTaxIdType')}</Label>
                              <Select
                                value={sh.taxIdType ?? 'SSN'}
                                onValueChange={(v) =>
                                  updateShareholder(idx, { taxIdType: v as 'SSN' | 'EIN' })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="SSN">SSN</SelectItem>
                                  <SelectItem value="EIN">EIN (trusts/estates)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="md:col-span-2 space-y-1.5">
                              <Label>{t('scorpTaxIdLabel')}</Label>
                              <Input
                                value={sh.taxId ?? ''}
                                onChange={(e) =>
                                  updateShareholder(idx, { taxId: e.target.value })
                                }
                                placeholder="123-45-6789"
                                inputMode="numeric"
                                autoComplete="off"
                              />
                              <p className="text-[11px] text-ink-subtle">
                                {t('scorpTaxIdHelp')}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <Label>{t('scorpTaxYearEnd')}</Label>
                              <Input
                                value={sh.taxYearEnd ?? '12/31'}
                                onChange={(e) =>
                                  updateShareholder(idx, { taxYearEnd: e.target.value })
                                }
                                placeholder="12/31"
                              />
                              <p className="text-[11px] text-ink-subtle">
                                {t('scorpTaxYearEndHelp')}
                              </p>
                            </div>
                          </div>
                          <label className="flex items-start gap-2 text-xs text-ink leading-snug cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!sh.sCorpConsent}
                              onChange={(e) =>
                                updateShareholder(idx, { sCorpConsent: e.target.checked })
                              }
                              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <span>{t('scorpConsentLabel')}</span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* LLC electing S-corp - collect each member's Form 2553 data. Corps
            handle this inline in the share table above; LLCs have members
            rather than a share allocation, so we key it to the member list. */}
        {llcSCorpActive && (
          <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/[0.04] p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-ink">{t('scorpMembersHeader')}</h3>
                <p className="text-xs text-ink-muted mt-0.5">{t('scorpMembersBody')}</p>
              </div>
            </div>

            {memberTax.length === 0 && (
              <p className="text-xs text-ink-muted">{t('scorpMembersEmpty')}</p>
            )}

            <div className="space-y-3">
              {memberTax.map((m, idx) => (
                <div key={m.memberId} className="rounded-lg border border-border bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink">
                      {m.name || t('shareholderOrdinal', { idx: idx + 1 })}
                    </p>
                    {m.ownershipPercentage != null && (
                      <span className="text-[11px] text-ink-subtle">
                        {m.ownershipPercentage}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('scorpTaxIdType')}</Label>
                      <Select
                        value={m.taxIdType}
                        onValueChange={(v) =>
                          updateMemberTax(idx, { taxIdType: v as 'SSN' | 'EIN' })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SSN">SSN</SelectItem>
                          <SelectItem value="EIN">EIN (trusts/estates)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <Label>{t('scorpTaxIdLabel')}</Label>
                      <Input
                        value={m.taxId}
                        onChange={(e) => updateMemberTax(idx, { taxId: e.target.value })}
                        placeholder={m.taxIdLast4 ? `On file •••-••-${m.taxIdLast4}` : '123-45-6789'}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <p className="text-[11px] text-ink-subtle">{t('scorpTaxIdHelp')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('scorpTaxYearEnd')}</Label>
                      <Input
                        value={m.taxYearEnd}
                        onChange={(e) => updateMemberTax(idx, { taxYearEnd: e.target.value })}
                        placeholder="12/31"
                      />
                      <p className="text-[11px] text-ink-subtle">{t('scorpTaxYearEndHelp')}</p>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-ink leading-snug cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.sCorpConsent}
                      onChange={(e) => updateMemberTax(idx, { sCorpConsent: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>{t('scorpConsentLabel')}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {needsWyOrganizer && (
          <div className="space-y-1.5">
            <Label htmlFor="organizerEmail" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Organizer email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="organizerEmail"
              type="email"
              value={organizerEmail}
              onChange={(e) => setOrganizerEmail(e.target.value)}
              placeholder="organizer@yourbusiness.com"
              className="max-w-md"
            />
            <p className="text-xs text-ink-muted">
              Wyoming requires the organizer's email on the Articles. The Secretary of State
              uses this to send filing confirmations.
            </p>
          </div>
        )}

        {needsWyConsent && (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer hover:border-primary/30">
            <input
              type="checkbox"
              checked={electronicServiceConsent}
              onChange={(e) => setElectronicServiceConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              required
            />
            <span className="text-sm text-ink leading-relaxed">
              I consent to receive electronic service of process and Wyoming Secretary of
              State notices on behalf of this entity. <span className="text-destructive">*</span>
            </span>
          </label>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="purpose">
            Business purpose <span className="text-ink-subtle font-normal">(optional)</span>
          </Label>
          <Textarea
            id="purpose"
            value={businessPurpose}
            onChange={(e) => setBusinessPurpose(e.target.value)}
            placeholder="Real estate investment and consulting"
            maxLength={500}
            rows={2}
          />
          <p className="text-xs text-ink-muted">
            A brief description of what your business will do. Most LLCs leave this blank or write
            "any lawful business activity."
          </p>
        </div>
      </div>

      {/*
        Processing speed selector. Hidden when the state only offers a single
        speed (e.g. Florida same-day default) - no need to make customers
        click through a single-choice form.
      */}
      {stateRule.processingOptions.length > 1 && (
        <div className="rounded-lg border border-border bg-white p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-ink">{stateRule.name} processing speed</p>
              <p className="text-xs text-ink-muted mt-0.5">
                State expedite fees are forwarded to {stateRule.name} - we do not mark them up.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stateRule.processingOptions.map((opt) => {
              const selected = processingOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProcessingOption(opt.id)}
                  aria-pressed={selected}
                  className={cn(
                    'text-left rounded-lg border-2 p-4 transition-all space-y-1',
                    selected
                      ? 'border-primary bg-primary/5 shadow-glow'
                      : 'border-border bg-white hover:border-primary/30',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink">{opt.label}</span>
                    <span className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-ink-muted')}>
                      {formatDollars(opt.feeCents)}
                      {opt.feeIsProvisional && opt.feeCents > 0 ? '*' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {opt.estimate} · {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
          {stateRule.processingOptions.some((o) => o.feeIsProvisional && o.feeCents > 0) && (
            <p className="text-[11px] text-ink-subtle italic">
              * Provisional state fee - confirmed at submission. We will reach out before charging
              if the actual amount differs.
            </p>
          )}
        </div>
      )}

      {/*
        Foreign-registration interest capture. Forming in WY/DE doesn't grant
        the right to operate in another state - that requires a separate
        "foreign qualification" filing with the operating state. We gather
        interest now and follow up post-formation once the dedicated product
        is live.
      */}
      {stateCode !== 'FL' && (
        <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer hover:border-primary/30">
          <input
            type="checkbox"
            checked={foreignInterest}
            onChange={(e) => setForeignInterest(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <div className="text-sm text-ink leading-relaxed">
            <span className="font-semibold inline-flex items-center gap-1.5">
              <Globe className="h-4 w-4" />
              I plan to operate in another state
            </span>
            <p className="text-xs text-ink-muted mt-1">
              Forming in {stateRule.name} doesn't authorize you to do business in another state.
              Most states require a separate "foreign qualification" filing if you have an office,
              employees, or significant operations there. We'll follow up after formation with help.
            </p>
          </div>
        </label>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/7`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
