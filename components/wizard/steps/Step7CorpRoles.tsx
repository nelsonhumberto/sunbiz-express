'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Briefcase,
  Copy,
  HelpCircle,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { saveStep7 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn, safeParseJson } from '@/lib/utils';
import { isActiveFormationState, type StateCode } from '@/lib/formation-states';
import type { AddressValue } from '../AddressForm';
import type { WizardFiling } from '../types';

type CorpTitle = 'DIRECTOR' | 'PRESIDENT' | 'TREASURER' | 'SECRETARY' | 'OFFICER';

interface CorpRole {
  /** Title slot for this row (drives validation + display). */
  title: CorpTitle;
  /** True when this row is a required slot (cannot be removed). */
  required?: boolean;
  name: string;
  street1?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** Email is kept in-memory for downstream autofill (EIN panel etc.).
   *  Not persisted to ManagerMember today — adding the column would
   *  require a Prisma migration we intentionally avoid in this step. */
  email?: string;
}

const REQUIRED_OFFICER_SLOTS: { title: Exclude<CorpTitle, 'DIRECTOR' | 'OFFICER'>; labelKey: string }[] = [
  { title: 'PRESIDENT', labelKey: 'officerSlotPresident' },
  { title: 'TREASURER', labelKey: 'officerSlotTreasurer' },
  { title: 'SECRETARY', labelKey: 'officerSlotSecretary' },
];

function isEmptyAddress(a: Partial<AddressValue> | null | undefined): boolean {
  if (!a) return true;
  return !(a.street1?.trim() || a.city?.trim() || a.zip?.trim());
}

function corpTitleLabelKey(t: CorpTitle): string {
  switch (t) {
    case 'DIRECTOR':
      return 'titleDirector';
    case 'PRESIDENT':
      return 'titlePresident';
    case 'TREASURER':
      return 'titleTreasurer';
    case 'SECRETARY':
      return 'titleSecretary';
    case 'OFFICER':
      return 'titleOfficer';
  }
}

/**
 * Corporation directors-and-officers step. Florida 607.08401 requires
 * the corp to have officers per its bylaws, and IRS Form SS-4 expects
 * the three universally-recognized roles (President, Treasurer,
 * Secretary). We hard-code those role slots, autofill the first director
 * from the account name, and let the customer "use existing person"
 * chips to clone any already-entered party into another slot — most
 * small business owners hold all four titles themselves.
 */
export function Step7CorpRoles({
  filing,
  defaultMemberName,
  defaultEmail,
}: {
  filing: WizardFiling;
  defaultMemberName?: string;
  defaultEmail?: string;
}) {
  const t = useTranslations('wizard');
  const filingStateCode: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';

  // Build the initial role set. If we have prior rows, hydrate from them
  // (preserving any saved director-extra rows). Otherwise create the
  // four required slots and prefill the first director.
  const initialRoles: CorpRole[] = useMemo(() => {
    if (filing.managersMembers.length > 0) {
      const rows: CorpRole[] = filing.managersMembers
        .filter((m) =>
          ['DIRECTOR', 'PRESIDENT', 'TREASURER', 'SECRETARY', 'OFFICER'].includes(m.title),
        )
        .map((m) => ({
          title: m.title as CorpTitle,
          name: m.name,
          street1: m.street1 ?? '',
          city: m.city ?? '',
          state: m.state ?? filingStateCode,
          zip: m.zip ?? '',
          email: '',
        }));
      // Make sure every required slot exists. If a previous wizard
      // pass missed one we add a blank slot so validation can light up.
      const seenTitles = new Set(rows.map((r) => r.title));
      if (!seenTitles.has('DIRECTOR')) {
        rows.unshift({
          title: 'DIRECTOR',
          required: true,
          name: '',
          state: filingStateCode,
          email: defaultEmail ?? '',
        });
      } else {
        const dir = rows.find((r) => r.title === 'DIRECTOR');
        if (dir) dir.required = true;
      }
      for (const slot of REQUIRED_OFFICER_SLOTS) {
        if (!seenTitles.has(slot.title)) {
          rows.push({
            title: slot.title,
            required: true,
            name: '',
            state: filingStateCode,
            email: '',
          });
        } else {
          const r = rows.find((row) => row.title === slot.title);
          if (r) r.required = true;
        }
      }
      return rows;
    }
    // Fresh filing: one prefilled director + three blank officer slots.
    return [
      {
        title: 'DIRECTOR',
        required: true,
        name: defaultMemberName ?? '',
        state: filingStateCode,
        email: defaultEmail ?? '',
      },
      {
        title: 'PRESIDENT',
        required: true,
        name: '',
        state: filingStateCode,
        email: '',
      },
      {
        title: 'TREASURER',
        required: true,
        name: '',
        state: filingStateCode,
        email: '',
      },
      {
        title: 'SECRETARY',
        required: true,
        name: '',
        state: filingStateCode,
        email: '',
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [roles, setRoles] = useState<CorpRole[]>(initialRoles);
  const [showTitleHelp, setShowTitleHelp] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Pull address sources from earlier wizard steps so officer cards
  // can one-tap copy the principal/mailing/RA address.
  const principalAddress = safeParseJson<AddressValue | null>(
    filing.principalAddress,
    null,
  );
  const rawMailing = safeParseJson<unknown>(filing.mailingAddress, null);
  const mailingAddress: AddressValue | null =
    rawMailing && typeof rawMailing === 'object'
      ? (rawMailing as AddressValue)
      : null;
  const raStored = safeParseJson<
    (AddressValue & { useOurService?: boolean; name?: string }) | null
  >(filing.registeredAgent, null);
  const externalRaAddress: AddressValue | null =
    raStored && raStored.useOurService === false
      ? {
          street1: raStored.street1 ?? '',
          street2: raStored.street2 ?? '',
          city: raStored.city ?? '',
          state: raStored.state ?? filingStateCode,
          zip: raStored.zip ?? '',
        }
      : null;

  const updateRole = (idx: number, patch: Partial<CorpRole>) =>
    setRoles((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  /** Clone everything (name/address/email) from `src` into row `idx`. */
  const copyPersonInto = (idx: number, src: CorpRole) => {
    updateRole(idx, {
      name: src.name,
      street1: src.street1 ?? '',
      city: src.city ?? '',
      state: (src.state ?? filingStateCode).toUpperCase(),
      zip: src.zip ?? '',
      email: src.email ?? '',
    });
  };

  const copyAddressInto = (idx: number, addr: AddressValue) =>
    updateRole(idx, {
      street1: addr.street1 ?? '',
      city: addr.city ?? '',
      state: (addr.state ?? filingStateCode).toUpperCase(),
      zip: addr.zip ?? '',
    });

  const addDirector = () =>
    setRoles((prev) => [
      ...prev,
      {
        title: 'DIRECTOR',
        name: '',
        state: filingStateCode,
        email: '',
      },
    ]);

  const removeRole = (idx: number) => {
    const role = roles[idx];
    if (role?.required) return;
    setRoles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Validation: every required slot must have a name. Directors that the
  // user added beyond the first are not required (we only require ≥ 1).
  const hasDirector = roles.some(
    (r) => r.title === 'DIRECTOR' && r.name.trim().length > 0,
  );
  const hasPresident = roles.some(
    (r) => r.title === 'PRESIDENT' && r.name.trim().length > 0,
  );
  const hasTreasurer = roles.some(
    (r) => r.title === 'TREASURER' && r.name.trim().length > 0,
  );
  const hasSecretary = roles.some(
    (r) => r.title === 'SECRETARY' && r.name.trim().length > 0,
  );
  const valid = hasDirector && hasPresident && hasTreasurer && hasSecretary;

  const onContinue = () => {
    if (!hasDirector) {
      toast.error(t('errorCorpDirectorRequired'));
      return;
    }
    if (!hasPresident) {
      toast.error(t('errorCorpPresidentRequired'));
      return;
    }
    if (!hasTreasurer) {
      toast.error(t('errorCorpTreasurerRequired'));
      return;
    }
    if (!hasSecretary) {
      toast.error(t('errorCorpSecretaryRequired'));
      return;
    }
    start(async () => {
      const res = await saveStep7({
        filingId: filing.id,
        members: roles.map((r) => ({
          title: r.title,
          name: r.name.trim(),
          street1: r.street1?.trim() || undefined,
          city: r.city?.trim() || undefined,
          state: r.state?.trim() || undefined,
          zip: r.zip?.trim() || undefined,
          ownerType: 'individual' as const,
        })),
      });
      if (!res.ok) {
        toast.error(res.error ?? t('errorSaveGeneric'));
        return;
      }
      router.push(`/wizard/${filing.id}/8`);
    });
  };

  // Build the list of "use existing person" chips. We surface every
  // already-named role + any prior wizard rows; clicking one copies all
  // fields into the current row so the same human can hold multiple
  // titles with a single click.
  const personChipsFor = (idx: number) => {
    const chips: { id: string; label: string; src: CorpRole }[] = [];
    roles.forEach((r, i) => {
      if (i === idx) return;
      if (!r.name.trim()) return;
      const titleLabel = t(corpTitleLabelKey(r.title));
      chips.push({
        id: `role-${i}`,
        label: t('fillFromPersonName', { name: `${r.name} (${titleLabel})` }),
        src: r,
      });
    });
    return chips;
  };

  const renderRoleCard = (role: CorpRole, idx: number) => {
    const chips = personChipsFor(idx);
    const titleLabel = t(corpTitleLabelKey(role.title));
    return (
      <div
        key={`${role.title}-${idx}`}
        className="rounded-lg border border-border bg-white p-5 space-y-4 relative"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-primary/10 text-primary">
              {titleLabel}
            </span>
            {role.required && (
              <span className="text-[11px] text-ink-subtle">{t('required')}</span>
            )}
          </div>
          {!role.required && (
            <button
              type="button"
              onClick={() => removeRole(idx)}
              className="text-ink-subtle hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
              aria-label={t('removeAria')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-subtle">
              <Copy className="h-3 w-3" />
              {t('useExistingPerson')}
            </span>
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => copyPersonInto(idx, chip.src)}
                className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label
              className={
                showMissing && role.required && !role.name.trim() ? 'text-destructive' : undefined
              }
            >
              {t('fullName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={role.name}
              onChange={(e) => updateRole(idx, { name: e.target.value })}
              placeholder={t('fullNamePlaceholder')}
              autoComplete="name"
              aria-invalid={showMissing && !!role.required && !role.name.trim()}
              className={
                showMissing && role.required && !role.name.trim()
                  ? 'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive'
                  : undefined
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('emailLabelOptional')}</Label>
            <Input
              type="email"
              value={role.email ?? ''}
              onChange={(e) => updateRole(idx, { email: e.target.value })}
              placeholder="name@business.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            {t('addressLabel')}
            <span className="text-xs font-normal text-ink-subtle">
              {t('optionalRecommended')}
            </span>
          </Label>
          <AddressQuickFillChips
            t={t}
            principal={principalAddress}
            mailing={mailingAddress}
            externalRa={externalRaAddress}
            onPick={(addr) => copyAddressInto(idx, addr)}
          />
          <div className="grid grid-cols-6 gap-2">
            <Input
              className="col-span-6 md:col-span-3"
              value={role.street1 ?? ''}
              onChange={(e) => updateRole(idx, { street1: e.target.value })}
              placeholder={t('streetAddressPlaceholder')}
            />
            <Input
              className="col-span-3 md:col-span-1"
              value={role.city ?? ''}
              onChange={(e) => updateRole(idx, { city: e.target.value })}
              placeholder={t('cityPlaceholder')}
            />
            <Input
              className="col-span-1"
              value={role.state ?? filingStateCode}
              onChange={(e) =>
                updateRole(idx, { state: e.target.value.toUpperCase() })
              }
              maxLength={2}
              placeholder={filingStateCode}
            />
            <Input
              className="col-span-2 md:col-span-1"
              value={role.zip ?? ''}
              onChange={(e) => updateRole(idx, { zip: e.target.value })}
              placeholder={t('zipPlaceholder')}
              maxLength={10}
            />
          </div>
        </div>
      </div>
    );
  };

  const directors = roles
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.title === 'DIRECTOR');
  const officers = roles
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.title !== 'DIRECTOR');

  return (
    <div className="space-y-5">
      {/* Title help — corp-specific officer/director glossary. */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <button
          type="button"
          onClick={() => setShowTitleHelp((s) => !s)}
          className="flex items-center justify-between w-full text-left"
          aria-expanded={showTitleHelp}
        >
          <span className="text-sm font-medium text-ink inline-flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            {t('titleHelpToggle')}
          </span>
          <span className="text-xs text-ink-muted">
            {showTitleHelp ? t('titleHelpHide') : t('titleHelpShow')}
          </span>
        </button>
        {showTitleHelp && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-ink-muted leading-relaxed">
            <div>
              <p className="font-semibold text-ink">{t('titleHelpDirector')}</p>
              <p>{t('titleHelpDirectorBody')}</p>
            </div>
            <div>
              <p className="font-semibold text-ink">{t('titleHelpPresident')}</p>
              <p>{t('titleHelpPresidentBody')}</p>
            </div>
            <div>
              <p className="font-semibold text-ink">{t('titleHelpTreasurer')}</p>
              <p>{t('titleHelpTreasurerBody')}</p>
            </div>
            <div>
              <p className="font-semibold text-ink">{t('titleHelpSecretary')}</p>
              <p>{t('titleHelpSecretaryBody')}</p>
            </div>
            <div className="md:col-span-2 text-[11px] text-ink-subtle italic">
              {t('titleHelpFooter')}
            </div>
          </div>
        )}
      </div>

      {/* Director section */}
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">{t('directorSectionHeader')}</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              {t('directorSectionBody')}
            </p>
          </div>
        </div>
        {directors.map(({ r, i }) => renderRoleCard(r, i))}
        <Button
          type="button"
          variant="outline"
          onClick={addDirector}
          className="w-full"
        >
          <UserPlus className="h-4 w-4" />
          {t('addDirector')}
        </Button>
      </section>

      {/* Officer section */}
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">{t('officerSectionHeader')}</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              {t('officerSectionBody')}
            </p>
            <p className="text-[11px] text-ink-subtle italic mt-1">
              {t('officerSectionTip')}
            </p>
          </div>
        </div>
        {officers.map(({ r, i }) => renderRoleCard(r, i))}
      </section>

      <WizardActions
        prevHref={`/wizard/${filing.id}/6`}
        onNext={onContinue}
        nextDisabled={!valid}
        onBlocked={() => {
          setShowMissing(true);
          onContinue();
        }}
        pending={pending}
      />
    </div>
  );
}

/** Helper: re-usable address quick-fill chips. */
function AddressQuickFillChips({
  t,
  principal,
  mailing,
  externalRa,
  onPick,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  principal: AddressValue | null;
  mailing: AddressValue | null;
  externalRa: AddressValue | null;
  onPick: (addr: AddressValue) => void;
}) {
  const items: { id: string; label: string; addr: AddressValue }[] = [];
  if (principal && !isEmptyAddress(principal)) {
    items.push({ id: 'principal', label: t('copyFromPrincipal'), addr: principal });
  }
  if (mailing && !isEmptyAddress(mailing)) {
    items.push({ id: 'mailing', label: t('copyFromMailing'), addr: mailing });
  }
  if (externalRa && !isEmptyAddress(externalRa)) {
    items.push({ id: 'ra', label: t('copyFromRA'), addr: externalRa });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex items-center flex-wrap gap-1.5 pb-0.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-subtle">
        <Copy className="h-3 w-3" />
        {t('copyAddressLabel')}
      </span>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onPick(it.addr)}
          className={cn(
            'inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
