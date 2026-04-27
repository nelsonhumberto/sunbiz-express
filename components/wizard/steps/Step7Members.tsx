'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Trash2, UserPlus, Users, UserCog, HelpCircle, FileText } from 'lucide-react';
import { saveStep7 } from '@/actions/wizard';
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
import type { WizardFiling } from '../types';

type ManagementType = 'member-managed' | 'manager-managed';

interface Member {
  title: 'MGR' | 'MGRM' | 'AMBR' | 'AP' | 'OFFICER' | 'DIRECTOR';
  name: string;
  street1?: string;
  city?: string;
  state?: string;
  zip?: string;
  ownershipPercentage?: number;
}

export function Step7Members({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const isLLC = filing.entityType === 'LLC';

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

  const storedOptional = safeParseJson<{ managementType?: ManagementType } | null>(
    filing.optionalDetails,
    null,
  );
  const [managementType, setManagementType] = useState<ManagementType>(
    storedOptional?.managementType ?? 'member-managed',
  );

  const initial: Member[] =
    filing.managersMembers.length > 0
      ? filing.managersMembers.map((m) => ({
          title: m.title as Member['title'],
          name: m.name,
          street1: m.street1 ?? '',
          city: m.city ?? '',
          state: m.state ?? 'FL',
          zip: m.zip ?? '',
          ownershipPercentage: m.ownershipPercentage ?? undefined,
        }))
      : [
          {
            title: isLLC ? 'AMBR' : 'OFFICER',
            name: '',
            street1: '',
            city: '',
            state: 'FL',
            zip: '',
          },
        ];

  const [members, setMembers] = useState<Member[]>(initial);
  const [showTitleHelp, setShowTitleHelp] = useState(false);
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
        state: 'FL',
        zip: '',
      },
    ]);

  const removeMember = (idx: number) => {
    if (members.length === 1) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
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

      {/* Title help — collapsible explanation of AMBR / MGR / MGRM / officer
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

            <div className="md:col-span-2 space-y-1.5">
              <Label>
                {t('fullName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={member.name}
                onChange={(e) => updateMember(idx, { name: e.target.value })}
                placeholder={t('fullNamePlaceholder')}
                autoComplete="name"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label className="flex items-center gap-2">
                {t('addressLabel')}
                <span className="text-xs font-normal text-ink-subtle">{t('optionalRecommended')}</span>
              </Label>
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
                  value={member.state ?? 'FL'}
                  onChange={(e) => updateMember(idx, { state: e.target.value.toUpperCase() })}
                  maxLength={2}
                  placeholder="FL"
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
            href={`/wizard/${filing.id}/11?addon=operating_agreement_multi`}
            className="bg-accent text-white px-4 py-2 rounded-md font-semibold hover:bg-accent/90 transition-colors text-sm shrink-0"
          >
            {t('oaMultiUpsellCta')}
          </Link>
        </div>
      )}

      {isLLC && !oaEntitled && members.length <= 1 && (
        <p className="text-xs text-ink-muted">{t('oaUpsellLine')}</p>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/6`}
        onNext={onContinue}
        nextDisabled={!valid}
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
