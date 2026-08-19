'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ShieldCheck,
  Lock,
  Globe2,
  AlertTriangle,
  CheckCircle2,
  IdCard,
  Plane,
  Loader2,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { saveEinResponsibleParty } from '@/actions/ein';
import { cn } from '@/lib/utils';
import { lastFourDigits, looksLikeUsTaxId } from '@/lib/ein';

type Pathway = 'us' | 'foreign';
type TaxIdType = 'SSN' | 'ITIN' | 'EIN';

// Friendly per-type labels, placeholders, and format hints. Each US
// federal tax id is still 9 digits, but the *display format* differs:
//   SSN  → 123-45-6789
//   ITIN → 9XX-7X-XXXX (always starts with 9, 4th/5th digits are 70-88, etc.)
//   EIN  → 12-3456789
// We surface that to the customer so they can confirm they're filling
// the right kind of number.
const TAXID_LABEL: Record<TaxIdType, string> = {
  SSN: 'Social Security Number (SSN)',
  ITIN: 'Individual Taxpayer ID (ITIN)',
  EIN: 'Employer Identification Number (EIN)',
};

const TAXID_PLACEHOLDER: Record<TaxIdType, string> = {
  SSN: '123-45-6789',
  ITIN: '9XX-7X-XXXX',
  EIN: '12-3456789',
};

const TAXID_FORMAT_HINT: Record<TaxIdType, string> = {
  SSN: '9-digit Social Security number, format ###-##-####.',
  ITIN: '9-digit ITIN starting with 9, format ###-##-####.',
  EIN: '9-digit federal Employer ID, format ##-#######.',
};

/**
 * Format a 9-digit string into the display layout for the chosen tax id
 * kind. The underlying state is always plain digits - formatting is
 * applied only for display so we can re-render correctly when the user
 * switches type.
 */
function formatTaxId(digits: string, type: TaxIdType): string {
  const d = digits.replace(/\D/g, '').slice(0, 9);
  if (!d) return '';
  if (type === 'EIN') {
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}-${d.slice(2)}`;
  }
  // SSN and ITIN both follow ###-##-####.
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export interface EinPanelInitialState {
  collected: boolean;
  pathway?: Pathway;
  legalName?: string;
  title?: string;
  phone?: string;
  email?: string;
  taxIdLast4?: string | null;
  taxIdType?: string | null;
  passportLast4?: string | null;
  countryOfCitizenship?: string | null;
}

interface EinPanelProps {
  filingId: string;
  initial: EinPanelInitialState;
  defaultEmail?: string;
  /** Pre-fill for the responsible-party legal name (account / member name). */
  defaultName?: string;
  /** Called when the panel transitions to the "saved" state. */
  onSaved?: (status: 'ready_online' | 'manual_foreign') => void;
}

/**
 * Renders the EIN responsible-party form. Shown above the payment card
 * whenever the customer's package includes EIN. The form has two distinct
 * paths because the IRS treats them very differently:
 *
 *  - US (SSN/ITIN): straight-through online filing via the IRS EIN
 *    Assistant. We collect a 9-digit tax id, encrypt it, and only display
 *    the last 4 in admin/customer UIs.
 *  - Foreign (no SSN/ITIN): the IRS online form is unavailable. We collect
 *    passport details, surface an explicit "human-assisted processing"
 *    notice, and route the application to our staff queue (status
 *    `manual_foreign`) where they prepare a paper SS-4 for fax/mail.
 */
export function EinResponsiblePartyPanel({
  filingId,
  initial,
  defaultEmail,
  defaultName,
  onSaved,
}: EinPanelProps) {
  const t = useTranslations('wizard');
  const [pathway, setPathway] = useState<Pathway>(initial.pathway ?? 'us');
  const [legalName, setLegalName] = useState(initial.legalName ?? defaultName ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.email ?? defaultEmail ?? '');

  // US-only fields.
  const [taxIdType, setTaxIdType] = useState<TaxIdType>(
    (initial.taxIdType as TaxIdType) ?? 'SSN',
  );
  const [taxId, setTaxId] = useState('');
  const [taxIdConsent, setTaxIdConsent] = useState(false);

  // Foreign-only fields.
  const [countryCitizen, setCountryCitizen] = useState(initial.countryOfCitizenship ?? '');
  const [passportCountry, setPassportCountry] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [identityConsent, setIdentityConsent] = useState(false);
  const [foreignFileConsent, setForeignFileConsent] = useState(false);

  const [saved, setSaved] = useState<null | 'ready_online' | 'manual_foreign'>(
    initial.collected
      ? initial.pathway === 'foreign'
        ? 'manual_foreign'
        : 'ready_online'
      : null,
  );
  const [pending, start] = useTransition();

  const baseValid =
    legalName.trim().length > 0 &&
    title.trim().length > 0 &&
    phone.trim().length >= 7 &&
    /\S+@\S+\.\S+/.test(email);

  const usValid =
    baseValid &&
    looksLikeUsTaxId(taxId) &&
    taxIdConsent &&
    !!taxIdType;

  const foreignValid =
    baseValid &&
    countryCitizen.trim().length > 1 &&
    passportCountry.trim().length > 1 &&
    passportNumber.trim().length >= 3 &&
    identityConsent &&
    foreignFileConsent;

  const canSave = pathway === 'us' ? usValid : foreignValid;

  const onSave = () => {
    if (!canSave) return;
    start(async () => {
      const payload =
        pathway === 'us'
          ? {
              filingId,
              responsiblePartyType: 'us' as const,
              legalName: legalName.trim(),
              title: title.trim(),
              phone: phone.trim(),
              email: email.trim().toLowerCase(),
              taxIdType,
              taxId: taxId.replace(/\D/g, ''),
              consentToFile: true as const,
            }
          : {
              filingId,
              responsiblePartyType: 'foreign' as const,
              legalName: legalName.trim(),
              title: title.trim(),
              phone: phone.trim(),
              email: email.trim().toLowerCase(),
              countryOfCitizenship: countryCitizen.trim(),
              passportCountry: passportCountry.trim(),
              passportNumber: passportNumber.trim(),
              identityVerificationConsent: true as const,
              consentToFile: true as const,
            };

      try {
        const res = await saveEinResponsibleParty(payload);
        if (!res.ok || !res.status) {
          toast.error(res.error ?? 'Could not save EIN information.');
          return;
        }
        // Wipe sensitive client-side state right after the round-trip.
        setTaxId('');
        setPassportNumber('');
        setSaved(res.status);
        onSaved?.(res.status);
        toast.success(t('einSavedToast'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast.error(msg);
      }
    });
  };

  if (saved) {
    return (
      <div className="rounded-lg border-2 border-success/30 bg-success-subtle/30 p-5">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-full bg-success text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{t('einSavedHeadline')}</p>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              {saved === 'ready_online'
                ? t('einReadyOnlineCopy')
                : t('einManualForeignCopy')}
            </p>
            {saved === 'ready_online' && (initial.taxIdLast4 || taxId) && (
              <p className="text-xs text-ink-subtle mt-2">
                {t('einTaxIdLast4', {
                  last4: initial.taxIdLast4 ?? lastFourDigits(taxId),
                })}
              </p>
            )}
            <button
              type="button"
              onClick={() => setSaved(null)}
              className="text-xs font-medium text-primary hover:text-primary-hover mt-2 underline-offset-4 hover:underline"
            >
              {t('einEditLink')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-ink">{t('einPanelHeadline')}</h3>
        </div>
        <p className="text-xs text-ink-subtle mt-1 inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {t('einPanelSecurityNote')}
        </p>
      </div>

      <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PathwayCard
          active={pathway === 'us'}
          onClick={() => setPathway('us')}
          icon={<IdCard className="h-4 w-4" />}
          title={t('einPathwayUsTitle')}
          subtitle={t('einPathwayUsSubtitle')}
        />
        <PathwayCard
          active={pathway === 'foreign'}
          onClick={() => setPathway('foreign')}
          icon={<Plane className="h-4 w-4" />}
          title={t('einPathwayForeignTitle')}
          subtitle={t('einPathwayForeignSubtitle')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ein-name">{t('einLegalName')} *</Label>
          <Input
            id="ein-name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder={t('einLegalNamePh')}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ein-title">{t('einTitle')} *</Label>
          <Input
            id="ein-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('einTitlePh')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ein-phone">{t('einPhone')} *</Label>
          <Input
            id="ein-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(305) 555-0100"
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ein-email">{t('einEmail')} *</Label>
          <Input
            id="ein-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      {pathway === 'us' ? (
        <div className="rounded-md border border-primary/15 bg-primary/[0.03] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ein-taxid-type">{t('einTaxIdType')} *</Label>
              <Select
                value={taxIdType}
                onValueChange={(v) => {
                  setTaxIdType(v as 'SSN' | 'ITIN' | 'EIN');
                  setTaxId('');
                }}
              >
                <SelectTrigger id="ein-taxid-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SSN">{t('einTaxSSN')}</SelectItem>
                  <SelectItem value="ITIN">{t('einTaxITIN')}</SelectItem>
                  <SelectItem value="EIN">{t('einTaxEIN')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ein-taxid">{TAXID_LABEL[taxIdType]} *</Label>
              <Input
                id="ein-taxid"
                value={formatTaxId(taxId, taxIdType)}
                onChange={(e) =>
                  setTaxId(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))
                }
                inputMode="numeric"
                placeholder={TAXID_PLACEHOLDER[taxIdType]}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-ink-subtle">
                {TAXID_FORMAT_HINT[taxIdType]} {t('einTaxIdHint')}
              </p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={taxIdConsent}
              onChange={(e) => setTaxIdConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t('einUsConsent')}</span>
          </label>
        </div>
      ) : (
        <div className="rounded-md border border-warn/30 bg-warn/[0.06] p-4 space-y-3">
          <div className="flex items-start gap-2 text-warn">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">{t('einForeignNotice')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ein-citizen-country">
                {t('einCountryOfCitizenship')} *
              </Label>
              <Input
                id="ein-citizen-country"
                value={countryCitizen}
                onChange={(e) => setCountryCitizen(e.target.value)}
                placeholder={t('einCountryPh')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ein-passport-country">
                {t('einPassportCountry')} *
              </Label>
              <Input
                id="ein-passport-country"
                value={passportCountry}
                onChange={(e) => setPassportCountry(e.target.value)}
                placeholder={t('einPassportCountryPh')}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ein-passport-number">{t('einPassportNumber')} *</Label>
              <Input
                id="ein-passport-number"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="A12345678"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-ink-subtle inline-flex items-center gap-1">
                <Globe2 className="h-3 w-3" />
                {t('einPassportHint')}
              </p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={identityConsent}
              onChange={(e) => setIdentityConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t('einForeignIdentityConsent')}</span>
          </label>
          <label className="flex items-start gap-2 text-xs text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={foreignFileConsent}
              onChange={(e) => setForeignFileConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t('einForeignFileConsent')}</span>
          </label>
        </div>
      )}

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || pending}
          className={cn(
            'inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-semibold',
            'bg-primary text-white hover:bg-primary-hover transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('einSaveBtn')}
        </button>
      </div>
    </div>
  );
}

function PathwayCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'text-left rounded-lg border-2 p-3 transition-all',
        active
          ? 'border-primary bg-primary/5 shadow-glow'
          : 'border-border bg-white hover:border-primary/30',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'h-8 w-8 rounded-md flex items-center justify-center shrink-0',
            active ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink text-sm">{title}</p>
          <p className="text-xs text-ink-muted leading-snug mt-0.5">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}
