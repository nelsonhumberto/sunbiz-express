'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Pencil, ShieldAlert } from 'lucide-react';
import { saveStep10 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { safeParseJson, formatDate } from '@/lib/utils';
import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import {
  getFormationState,
  isActiveFormationState,
  resolveProcessingOption,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';
import type { AddressValue } from '../AddressForm';

type ManagementType = 'member-managed' | 'manager-managed';

export function Step10Review({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const tDocs = useTranslations('documentTypes');
  const tCommon = useTranslations('common');
  const filingStateCode: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateRule = getFormationState(filingStateCode);
  const principal = safeParseJson<AddressValue>(filing.principalAddress, {
    street1: '',
    city: '',
    state: '',
    zip: '',
  });
  const mailingRaw = safeParseJson<unknown>(filing.mailingAddress, null);
  const mailing =
    mailingRaw === 'SAME_AS_PRINCIPAL' ? principal : (mailingRaw as AddressValue | null);
  const ra = safeParseJson<{
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    useOurService?: boolean;
  } | null>(filing.registeredAgent, null);
  const correspondence = safeParseJson<{ email?: string; phone?: string } | null>(
    filing.correspondenceContact,
    null,
  );
  const opt = safeParseJson<{
    effectiveDate?: string;
    authorizedShares?: number;
    businessPurpose?: string;
    managementType?: ManagementType;
    processingOption?: string;
    foreignRegistrationInterest?: boolean;
    shareStructure?: {
      issuedShares?: number;
      sCorpElected?: boolean;
      shareholders?: Array<{
        name: string;
        shares?: number;
        taxIdLast4?: string | null;
        sCorpConsent?: boolean | null;
      }>;
    };
  } | null>(filing.optionalDetails, null);

  const [signature, setSignature] = useState(filing.incorporatorSignature ?? '');
  const [confirmed, setConfirmed] = useState(filing.confirmationAccepted);
  const [pending, start] = useTransition();
  const router = useRouter();

  const valid = signature.trim().length >= 2 && confirmed;

  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const isLLC = filing.entityType === 'LLC';
  const oaEntitled =
    isLLC &&
    filingHasOperatingAgreement({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs,
      memberCount: filing.managersMembers.length,
    });

  const onContinue = () => {
    start(async () => {
      const res = await saveStep10({
        filingId: filing.id,
        signature,
        confirmAccurate: confirmed,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('errorSaveGeneric'));
        return;
      }
      router.push(`/wizard/${filing.id}/10`);
    });
  };

  const stepHref = (n: number) => `/wizard/${filing.id}/${n}`;

  const managementLabel =
    opt?.managementType === 'manager-managed'
      ? t('managerManaged')
      : opt?.managementType === 'member-managed'
        ? t('memberManaged')
        : '—';

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-warn/30 bg-warn-subtle/40 p-4 flex items-start gap-3 text-sm">
        <ShieldAlert className="h-5 w-5 text-warn shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-ink">{t('finalReview')}</p>
          <p className="text-ink-muted text-xs leading-relaxed">
            {t('finalReviewBody', { state: stateRule.name })}
          </p>
        </div>
      </div>

      {/* Sections */}
      <ReviewSection title={t('businessBasics')} stepHref={stepHref(1)} editLabel={tCommon('edit')}>
        <Row
          label={t('entityType')}
          value={
            isLLC
              ? `${stateRule.name} Limited Liability Company`
              : `${stateRule.name} Corporation`
          }
        />
        <Row label={t('businessNameLabel')} value={filing.businessName ?? '—'} mono />
        <Row label={t('serviceTier')} value={filing.serviceTier} />
      </ReviewSection>

      <ReviewSection title={t('addresses')} stepHref={stepHref(4)} editLabel={tCommon('edit')}>
        <Row label={t('principalLabel')} value={fmtAddr(principal)} />
        <Row
          label={t('mailingLabel')}
          value={mailingRaw === 'SAME_AS_PRINCIPAL' ? t('sameAsPrincipalLabel') : fmtAddr(mailing)}
        />
      </ReviewSection>

      <ReviewSection title={t('registeredAgent')} stepHref={stepHref(6)} editLabel={tCommon('edit')}>
        <Row
          label={t('providerLabel')}
          value={ra?.useOurService ? t('providerInternal') : t('providerExternal')}
        />
        <Row label={t('nameLabel')} value={ra?.name ?? '—'} />
        <Row label={t('addressLabel')} value={fmtAddr(ra ?? null)} />
      </ReviewSection>

      <ReviewSection
        title={isLLC ? t('memberOrManager') : t('directorsAndOfficers')}
        stepHref={stepHref(7)}
        editLabel={tCommon('edit')}
      >
        {isLLC && (
          <Row label={t('managementLabel')} value={managementLabel} />
        )}
        <ul className="text-sm space-y-1">
          {filing.managersMembers.map((m) => (
            <li
              key={m.id}
              className="flex items-baseline justify-between gap-3 py-1 border-b border-border last:border-b-0"
            >
              <span>
                <span className="text-ink-subtle text-xs uppercase tracking-wider mr-2">
                  {m.title}
                </span>
                <span className="font-medium">{m.name}</span>
              </span>
              {oaEntitled && m.ownershipPercentage != null && (
                <span className="text-xs text-ink-muted">{m.ownershipPercentage.toFixed(1)}%</span>
              )}
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection title={t('correspondenceEmail')} stepHref={null} editLabel={tCommon('edit')}>
        <Row label={t('emailAccountLabel')} value={correspondence?.email ?? '—'} mono />
        <p className="text-xs text-ink-muted">
          {t.rich('accountSettingsBlurb', {
            link: (chunks) => (
              <Link href="/dashboard/settings" className="text-primary hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </ReviewSection>

      {opt &&
        (opt.effectiveDate ||
          opt.authorizedShares ||
          opt.businessPurpose ||
          opt.processingOption ||
          opt.foreignRegistrationInterest ||
          opt.shareStructure) && (
          <ReviewSection title={t('optionalDetails')} stepHref={stepHref(8)} editLabel={tCommon('edit')}>
            {opt.effectiveDate && (
              <Row label={t('effectiveDate')} value={formatDate(opt.effectiveDate)} />
            )}
            {opt.authorizedShares != null && (
              <Row label={t('authorizedShares')} value={opt.authorizedShares.toLocaleString()} />
            )}
            {opt.shareStructure?.issuedShares != null && (
              <Row
                label={t('issuedSharesLabel')}
                value={opt.shareStructure.issuedShares.toLocaleString()}
              />
            )}
            {opt.shareStructure?.shareholders && opt.shareStructure.shareholders.length > 0 && (
              <div className="grid grid-cols-3 gap-3 text-sm py-1">
                <span className="text-ink-muted">{t('shareholdersHeader')}</span>
                <ul className="col-span-2 space-y-1">
                  {opt.shareStructure.shareholders.map((sh, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 border-b border-border last:border-b-0 py-1">
                      <span>
                        <span className="font-medium">{sh.name}</span>
                        {opt.shareStructure?.sCorpElected && sh.taxIdLast4 ? (
                          <span className="ml-2 text-[11px] text-ink-subtle">
                            SSN •••••{sh.taxIdLast4}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {(sh.shares ?? 0).toLocaleString()} shares
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {opt.businessPurpose && (
              <Row label={t('businessPurpose')} value={opt.businessPurpose} />
            )}
            {(() => {
              const stateCode: StateCode = isActiveFormationState(filing.state)
                ? (filing.state as StateCode)
                : 'FL';
              const proc = resolveProcessingOption(stateCode, opt.processingOption);
              const fee = proc.feeCents > 0 ? ` · $${(proc.feeCents / 100).toFixed(2)}` : '';
              return (
                <Row
                  label="Processing speed"
                  value={`${proc.label} (${proc.estimate})${fee}`}
                />
              );
            })()}
            {opt.foreignRegistrationInterest && (
              <Row
                label="Foreign-state operations"
                value="Customer indicated interest in foreign qualification"
              />
            )}
          </ReviewSection>
        )}

      {/* Signature */}
      <div className="rounded-lg border border-border bg-white p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-ink mb-1">{t('signElectronically')}</h3>
          <p className="text-sm text-ink-muted">
            Type your full name as the authorized representative. Your typed name has the same legal effect as a handwritten signature on this filing.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="incorporatorSignature">
            {t('typeName')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="incorporatorSignature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={t('signaturePlaceholder')}
            className="font-display text-2xl italic h-14 text-primary"
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            className="mt-0.5"
            id="confirmAccurate"
          />
          <Label
            htmlFor="confirmAccurate"
            className="text-sm text-ink-muted leading-relaxed cursor-pointer"
          >
            {t('confirmAccurate')}
          </Label>
        </label>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/8`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}

function ReviewSection({
  title,
  stepHref,
  children,
  editLabel,
}: {
  title: string;
  stepHref: string | null;
  children: React.ReactNode;
  editLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-semibold text-ink text-sm">{title}</h3>
        {stepHref && (
          <Link
            href={stepHref}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editLabel}
          </Link>
        )}
      </div>
      <div className="px-5 py-4 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm py-1">
      <span className="text-ink-muted">{label}</span>
      <span className={`col-span-2 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function fmtAddr(
  a:
    | { street1?: string; street2?: string; city?: string; state?: string; zip?: string }
    | null
    | undefined,
) {
  if (!a || !a.street1) return '—';
  const lines = [a.street1, a.street2, `${a.city ?? ''}, ${a.state ?? ''} ${a.zip ?? ''}`.trim()]
    .filter(Boolean)
    .join(', ');
  return lines;
}
