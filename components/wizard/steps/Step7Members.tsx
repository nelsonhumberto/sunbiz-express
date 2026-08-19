'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  Trash2,
  UserPlus,
  Users,
  UserCog,
  HelpCircle,
  FileText,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { saveStep7 } from '@/actions/wizard';
import { Step7CorpRoles } from './Step7CorpRoles';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import { safeParseJson, cn } from '@/lib/utils';
import { isActiveFormationState, type StateCode } from '@/lib/formation-states';
import type { AddressValue } from '../AddressForm';
import type { WizardFiling } from '../types';

interface AddressSource {
  id: string;
  /** Pre-translated label shown on the chip. */
  label: string;
  address: AddressValue;
}

/** Returns true if every street/city/zip slot is empty (an address skeleton). */
function isEmptyAddress(a: Partial<AddressValue> | null | undefined): boolean {
  if (!a) return true;
  return !(a.street1?.trim() || a.city?.trim() || a.zip?.trim());
}

/** Returns true if two addresses are visually identical (so we hide dupes). */
function sameAddress(a: AddressValue, b: AddressValue): boolean {
  return (
    (a.street1 ?? '').trim() === (b.street1 ?? '').trim() &&
    (a.street2 ?? '').trim() === (b.street2 ?? '').trim() &&
    (a.city ?? '').trim() === (b.city ?? '').trim() &&
    (a.state ?? '').trim() === (b.state ?? '').trim() &&
    (a.zip ?? '').trim() === (b.zip ?? '').trim()
  );
}

type ManagementType = 'member-managed' | 'manager-managed';

interface Member {
  title: 'MGR' | 'MGRM' | 'AMBR' | 'AP' | 'OFFICER' | 'DIRECTOR';
  name: string;
  street1?: string;
  city?: string;
  state?: string;
  zip?: string;
  ownershipPercentage?: number;
  /** "individual" (default) or "business" for entity owners. */
  ownerType?: 'individual' | 'business';
  /** Business owner: legal entity name (also copied into `name`). */
  businessLegalName?: string;
  /** Business owner: state/country of formation. */
  businessJurisdiction?: string;
  /** Business owner: optional contact/authorized signer. */
  signerName?: string;
}

export function Step7Members({
  filing,
  defaultMemberName,
  defaultEmail,
}: {
  filing: WizardFiling;
  /** Pre-fill for the first member's name when none have been entered yet
   *  (account first/last name or guest entry name). */
  defaultMemberName?: string;
  /** Pre-fill for the email field on officer/director rows. */
  defaultEmail?: string;
}) {
  const t = useTranslations('wizard');
  const isLLC = filing.entityType === 'LLC';

  // Corporations get an entirely different UI: required role slots (one
  // Director + President / Treasurer / Secretary), no business-entity
  // toggle, no ownership %, and quick-fill chips so the same person can
  // hold multiple titles with one click. We dispatch to a dedicated
  // component to keep the LLC code path untouched.
  if (!isLLC) {
    return (
      <Step7CorpRoles
        filing={filing}
        defaultMemberName={defaultMemberName}
        defaultEmail={defaultEmail}
      />
    );
  }
  const filingStateCode: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';

  const LLC_MEMBER_TITLES = [
    { value: 'AMBR', label: t('titleAuthorizedMember') },
    { value: 'MGRM', label: t('titleManagingMember') },
    { value: 'AP', label: t('titleAuthorizedPerson') },
  ];
  const LLC_MANAGER_TITLES = [
    { value: 'MGR', label: t('titleManager') },
    { value: 'AP', label: t('titleAuthorizedPerson') },
  ];
  const CORP_TITLES = [
    { value: 'OFFICER', label: t('titleOfficer') },
    { value: 'DIRECTOR', label: t('titleDirector') },
  ];

  const storedOptional = safeParseJson<{
    managementType?: ManagementType;
    includeMembersOnArticles?: boolean;
  } | null>(filing.optionalDetails, null);
  const [managementType, setManagementType] = useState<ManagementType>(
    storedOptional?.managementType ?? 'member-managed',
  );
  // Delaware-only: defaults to NOT disclosing (privacy is the main reason
  // founders pick Delaware). Customer can opt-in.
  const isDelawareLlc = filing.state?.toUpperCase() === 'DE' && isLLC;
  const [includeMembersOnArticles, setIncludeMembersOnArticles] = useState<boolean>(
    storedOptional?.includeMembersOnArticles ?? false,
  );

  const initial: Member[] =
    filing.managersMembers.length > 0
      ? filing.managersMembers.map((m) => ({
          title: m.title as Member['title'],
          name: m.name,
          street1: m.street1 ?? '',
          city: m.city ?? '',
          state: m.state ?? filingStateCode,
          zip: m.zip ?? '',
          ownershipPercentage: m.ownershipPercentage ?? undefined,
          ownerType: (m.ownerType as 'individual' | 'business' | null) ?? 'individual',
          businessLegalName: m.businessLegalName ?? '',
          businessJurisdiction: m.businessJurisdiction ?? '',
          signerName: m.signerName ?? '',
        }))
      : [
          {
            title: isLLC ? 'AMBR' : 'OFFICER',
            name: defaultMemberName ?? '',
            street1: '',
            city: '',
            state: filingStateCode,
            zip: '',
            ownerType: 'individual',
          },
        ];

  const [members, setMembers] = useState<Member[]>(initial);
  const [showTitleHelp, setShowTitleHelp] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  // OA entitlement drives whether ownership percentages are collected.
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const oaEntitled =
    isLLC &&
    filingHasOperatingAgreement({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs,
      memberCount: members.length,
    });

  // Title list depends on entity type and (for LLC) management style.
  const titles = !isLLC
    ? CORP_TITLES
    : managementType === 'manager-managed'
      ? LLC_MANAGER_TITLES
      : LLC_MEMBER_TITLES;

  const updateMember = (idx: number, patch: Partial<Member>) =>
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const addMember = () =>
    setMembers((prev) => [
      ...prev,
      {
        title: !isLLC
          ? 'OFFICER'
          : managementType === 'manager-managed'
            ? 'MGR'
            : 'AMBR',
        name: '',
        street1: '',
        city: '',
        state: filingStateCode,
        zip: '',
        ownerType: 'individual',
      },
    ]);

  const removeMember = (idx: number) => {
    if (members.length === 1) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Surface previously-entered addresses (principal, mailing, external RA,
  // earlier members) as one-tap quick-fill chips on every member's address
  // field. Members commonly share a home or office address with the
  // company, so reducing this to one click meaningfully cuts wizard
  // friction.
  const principalAddress = safeParseJson<AddressValue | null>(
    filing.principalAddress,
    null,
  );
  const rawMailing = safeParseJson<unknown>(filing.mailingAddress, null);
  const mailingAddress: AddressValue | null =
    rawMailing && typeof rawMailing === 'object'
      ? (rawMailing as AddressValue)
      : null; // 'SAME_AS_PRINCIPAL' → no separate value to copy from
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

  /**
   * Build the list of address sources the member at `idx` can copy from.
   * We exclude the member's own row, drop empty addresses, and de-dupe
   * against earlier sources so we never surface "Principal" and "Mailing"
   * chips that resolve to the same value.
   */
  const sourcesForMember = (idx: number): AddressSource[] => {
    const list: AddressSource[] = [];
    const push = (source: AddressSource) => {
      if (isEmptyAddress(source.address)) return;
      if (list.some((s) => sameAddress(s.address, source.address))) return;
      list.push(source);
    };
    if (principalAddress) {
      push({ id: 'principal', label: t('copyFromPrincipal'), address: principalAddress });
    }
    if (mailingAddress) {
      push({ id: 'mailing', label: t('copyFromMailing'), address: mailingAddress });
    }
    if (externalRaAddress) {
      push({ id: 'ra', label: t('copyFromRA'), address: externalRaAddress });
    }
    members.forEach((m, i) => {
      if (i === idx) return;
      const addr: AddressValue = {
        street1: m.street1 ?? '',
        city: m.city ?? '',
        state: m.state ?? filingStateCode,
        zip: m.zip ?? '',
      };
      if (isEmptyAddress(addr)) return;
      const labelKey = isLLC ? 'copyFromMember' : 'copyFromOfficer';
      push({
        id: `member-${i}`,
        label: t(labelKey, { idx: i + 1 }),
        address: addr,
      });
    });
    return list;
  };

  const copyAddressTo = (idx: number, src: AddressValue) => {
    updateMember(idx, {
      street1: src.street1 ?? '',
      city: src.city ?? '',
      state: (src.state ?? filingStateCode).toUpperCase(),
      zip: src.zip ?? '',
    });
  };

  const totalOwnership =
    isLLC && oaEntitled
      ? members.reduce((sum, m) => sum + (m.ownershipPercentage ?? 0), 0)
      : 100;

  const allNamed = members.every((m) => m.name.trim().length > 0);
  const ownershipOk =
    !isLLC ||
    !oaEntitled ||
    members.length === 1 ||
    Math.abs(totalOwnership - 100) < 0.01;
  const hasManager =
    !isLLC ||
    managementType === 'member-managed' ||
    members.some((m) => m.title === 'MGR' || m.title === 'MGRM');

  const valid = allNamed && ownershipOk && hasManager;

  const onContinue = () => {
    if (!allNamed) {
      setShowMissing(true);
      toast.error(t('errorMembersRequired'));
      return;
    }
    if (!hasManager) {
      toast.error(t('managerRequired'));
      return;
    }
    if (!ownershipOk) {
      toast.error(t('ownershipMustTotal', { total: totalOwnership.toFixed(2) }));
      return;
    }
    start(async () => {
      const res = await saveStep7({
        filingId: filing.id,
        managementType: isLLC ? managementType : undefined,
        members: members.map((m) => ({
          ...m,
          ownershipPercentage:
            oaEntitled && m.ownershipPercentage != null ? Number(m.ownershipPercentage) : undefined,
        })),
        includeMembersOnArticles: isDelawareLlc ? includeMembersOnArticles : undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('errorSaveGeneric'));
        return;
      }
      router.push(`/wizard/${filing.id}/8`);
    });
  };

  return (
    <div className="space-y-5">
      {isLLC && (
        <div className="rounded-lg border border-border bg-white p-5 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              {t('managementHeader')}
            </p>
            <h3 className="font-semibold text-ink">{t('managementQuestion')}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ManagementCard
              icon={Users}
              title={t('memberManaged')}
              description={t('memberManagedDesc')}
              selected={managementType === 'member-managed'}
              onClick={() => setManagementType('member-managed')}
            />
            <ManagementCard
              icon={UserCog}
              title={t('managerManaged')}
              description={t('managerManagedDesc')}
              selected={managementType === 'manager-managed'}
              onClick={() => setManagementType('manager-managed')}
            />
          </div>
        </div>
      )}

      {/* Title help - collapsible explanation of AMBR / MGR / MGRM / officer
          codes, mirroring the wording on Florida CR2E047 / 607 forms. */}
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
            {isLLC ? (
              <>
                <div>
                  <p className="font-semibold text-ink">{t('titleHelpAMBR')}</p>
                  <p>{t('titleHelpAMBRBody')}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">{t('titleHelpMGR')}</p>
                  <p>{t('titleHelpMGRBody')}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">{t('titleHelpMGRM')}</p>
                  <p>{t('titleHelpMGRMBody')}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">{t('titleHelpAP')}</p>
                  <p>{t('titleHelpAPBody')}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-ink">{t('titleHelpOfficer')}</p>
                  <p>{t('titleHelpOfficerBody')}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">{t('titleHelpDirector')}</p>
                  <p>{t('titleHelpDirectorBody')}</p>
                </div>
              </>
            )}
            <div className="md:col-span-2 text-[11px] text-ink-subtle italic">
              {t('titleHelpFooter')}
            </div>
          </div>
        )}
      </div>

      {members.map((member, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border bg-white p-5 space-y-4 relative"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              {isLLC
                ? t('memberOrdinal', { idx: idx + 1 })
                : t('officerOrdinal', { idx: idx + 1 })}
            </p>
            {members.length > 1 && (
              <button
                type="button"
                onClick={() => removeMember(idx)}
                className="text-ink-subtle hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                aria-label={t('removeAria')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/*
            Owner-type toggle. Most owners are individuals, but it's
            increasingly common (esp. holding companies, family trusts) for
            an existing entity to be the owner / member / manager. Switching
            to "Business" replaces the personal-name field with structured
            entity fields (legal name + jurisdiction + optional signer).
          */}
          <div className="inline-flex items-center rounded-md bg-muted/40 p-0.5 border border-border">
            <button
              type="button"
              onClick={() => updateMember(idx, { ownerType: 'individual' })}
              aria-pressed={(member.ownerType ?? 'individual') === 'individual'}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded transition-colors',
                (member.ownerType ?? 'individual') === 'individual'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => updateMember(idx, { ownerType: 'business' })}
              aria-pressed={member.ownerType === 'business'}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded transition-colors',
                member.ownerType === 'business'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Business / entity
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>
                {t('title')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={member.title}
                onValueChange={(v) => updateMember(idx, { title: v as Member['title'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {titles.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {member.ownerType === 'business' ? (
              <>
                <div className="md:col-span-2 space-y-1.5">
                  <Label>
                    Legal entity name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={member.businessLegalName ?? ''}
                    onChange={(e) =>
                      updateMember(idx, {
                        businessLegalName: e.target.value,
                        // Mirror to `name` so legacy callers (PDF/admin) still see something.
                        name: e.target.value,
                      })
                    }
                    placeholder="Acme Holdings, LLC"
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    State / country of formation <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={member.businessJurisdiction ?? ''}
                    onChange={(e) => updateMember(idx, { businessJurisdiction: e.target.value })}
                    placeholder="Delaware"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label>
                    Authorized signer / contact{' '}
                    <span className="text-xs font-normal text-ink-subtle">(optional)</span>
                  </Label>
                  <Input
                    value={member.signerName ?? ''}
                    onChange={(e) => updateMember(idx, { signerName: e.target.value })}
                    placeholder="Jane Doe, Manager"
                    autoComplete="name"
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2 space-y-1.5">
                <Label className={showMissing && !member.name.trim() ? 'text-destructive' : undefined}>
                  {t('fullName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={member.name}
                  onChange={(e) => updateMember(idx, { name: e.target.value })}
                  placeholder={t('fullNamePlaceholder')}
                  autoComplete="name"
                  aria-invalid={showMissing && !member.name.trim()}
                  className={
                    showMissing && !member.name.trim()
                      ? 'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive'
                      : undefined
                  }
                />
              </div>
            )}

            <div className="md:col-span-3 space-y-1.5">
              <Label className="flex items-center gap-2">
                {t('addressLabel')}
                <span className="text-xs font-normal text-ink-subtle">{t('optionalRecommended')}</span>
              </Label>
              {(() => {
                const sources = sourcesForMember(idx);
                if (sources.length === 0) return null;
                return (
                  <div className="flex items-center flex-wrap gap-1.5 pb-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-subtle">
                      <Copy className="h-3 w-3" />
                      {t('copyAddressLabel')}
                    </span>
                    {sources.map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => copyAddressTo(idx, src.address)}
                        className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                );
              })()}
              <div className="grid grid-cols-6 gap-2">
                <Input
                  className="col-span-6 md:col-span-3"
                  value={member.street1 ?? ''}
                  onChange={(e) => updateMember(idx, { street1: e.target.value })}
                  placeholder={t('streetAddressPlaceholder')}
                />
                <Input
                  className="col-span-3 md:col-span-1"
                  value={member.city ?? ''}
                  onChange={(e) => updateMember(idx, { city: e.target.value })}
                  placeholder={t('cityPlaceholder')}
                />
                <Input
                  className="col-span-1"
                  value={member.state ?? filingStateCode}
                  onChange={(e) => updateMember(idx, { state: e.target.value.toUpperCase() })}
                  maxLength={2}
                  placeholder={filingStateCode}
                />
                <Input
                  className="col-span-2 md:col-span-1"
                  value={member.zip ?? ''}
                  onChange={(e) => updateMember(idx, { zip: e.target.value })}
                  placeholder={t('zipPlaceholder')}
                  maxLength={10}
                />
              </div>
            </div>

            {isLLC && oaEntitled && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  {t('ownership')}
                  {members.length === 1 && (
                    <span className="text-xs font-normal text-ink-subtle">{t('ownershipDefault100')}</span>
                  )}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={member.ownershipPercentage ?? ''}
                  onChange={(e) =>
                    updateMember(idx, {
                      ownershipPercentage: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="100"
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addMember} className="w-full">
        <UserPlus className="h-4 w-4" />
        {t('addAnother')} {isLLC ? t('memberOrManager') : t('officerOrDirector')}
      </Button>

      {isLLC && oaEntitled && members.length > 1 && Math.abs(totalOwnership - 100) > 0.01 && (
        <p
          className={cn(
            'text-xs flex items-center gap-1.5',
            totalOwnership === 0 ? 'text-ink-muted' : 'text-warn',
          )}
        >
          {t('ownershipTotalsBlock', { total: totalOwnership.toFixed(2) })}
        </p>
      )}

      {isLLC && !oaEntitled && members.length > 1 && (
        <div className="rounded-2xl border-2 border-accent/40 bg-accent/5 p-5 flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-accent text-white flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-accent-700 font-semibold">
              {t('oaMultiUpsellEyebrow')}
            </p>
            <p className="font-semibold text-ink mt-0.5">{t('oaMultiUpsellHeadline')}</p>
            <p className="text-sm text-ink-muted mt-1">{t('oaMultiUpsellBody')}</p>
          </div>
          <Link
            href={`/wizard/${filing.id}/10?addon=operating_agreement_multi`}
            className="bg-accent text-white px-4 py-2 rounded-md font-semibold hover:bg-accent/90 transition-colors text-sm shrink-0"
          >
            {t('oaMultiUpsellCta')}
          </Link>
        </div>
      )}

      {isLLC && !oaEntitled && members.length <= 1 && (
        <p className="text-xs text-ink-muted">{t('oaUpsellLine')}</p>
      )}

      {/*
        Delaware LLC member-disclosure preference. Delaware does not require
        members to be listed on the Certificate of Formation - most founders
        leave them off for privacy. We default to "do not include" and let
        the customer opt in if they prefer the public disclosure.
      */}
      {isDelawareLlc && (
        <div className="rounded-lg border border-border bg-white p-5 space-y-3">
          <div className="flex items-start gap-3">
            {includeMembersOnArticles ? (
              <Eye className="h-5 w-5 text-primary mt-0.5" />
            ) : (
              <EyeOff className="h-5 w-5 text-primary mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-ink">
                Delaware Certificate - initial member disclosure
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                Delaware lets you choose whether to list initial member names and addresses on the
                publicly-filed Certificate of Formation. Most founders leave them off for privacy.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIncludeMembersOnArticles(false)}
              aria-pressed={!includeMembersOnArticles}
              className={cn(
                'text-left rounded-lg border-2 p-4 transition-all space-y-1',
                !includeMembersOnArticles
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-white hover:border-primary/30',
              )}
            >
              <p className="font-semibold text-ink">Do not include (recommended)</p>
              <p className="text-xs text-ink-muted">
                Member info stays in your private records. Default Delaware behavior.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setIncludeMembersOnArticles(true)}
              aria-pressed={includeMembersOnArticles}
              className={cn(
                'text-left rounded-lg border-2 p-4 transition-all space-y-1',
                includeMembersOnArticles
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-white hover:border-primary/30',
              )}
            >
              <p className="font-semibold text-ink">Include initial members</p>
              <p className="text-xs text-ink-muted">
                Names and addresses listed on the public Certificate of Formation.
              </p>
            </button>
          </div>
        </div>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/6`}
        onNext={onContinue}
        nextDisabled={!valid}
        onBlocked={() => {
          setShowMissing(true);
          if (!allNamed) toast.error(t('errorMembersRequired'));
          else if (!hasManager) toast.error(t('managerRequired'));
          else if (!ownershipOk) toast.error(t('ownershipMustTotal', { total: totalOwnership.toFixed(2) }));
        }}
        pending={pending}
      />
    </div>
  );
}

function ManagementCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-lg border-2 p-4 transition-all flex gap-3',
        selected
          ? 'border-primary bg-primary/5 shadow-glow'
          : 'border-border bg-white hover:border-primary/30',
      )}
    >
      <div
        className={cn(
          'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
          selected ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-ink text-sm leading-tight">{title}</h4>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
