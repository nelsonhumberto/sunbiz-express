'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, UserPlus } from 'lucide-react';
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
import type { WizardFiling } from '../types';

interface Member {
  title: 'MGR' | 'MGRM' | 'AMBR' | 'AP' | 'OFFICER' | 'DIRECTOR';
  name: string;
  street1?: string;
  city?: string;
  state?: string;
  zip?: string;
  ownershipPercentage?: number;
}

const LLC_TITLES = [
  { value: 'AMBR', label: 'Authorized Member' },
  { value: 'MGR', label: 'Manager' },
  { value: 'MGRM', label: 'Managing Member' },
  { value: 'AP', label: 'Authorized Person' },
];
const CORP_TITLES = [
  { value: 'OFFICER', label: 'Officer' },
  { value: 'DIRECTOR', label: 'Director' },
];

export function Step7Members({ filing }: { filing: WizardFiling }) {
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
            title: filing.entityType === 'LLC' ? 'AMBR' : 'OFFICER',
            name: '',
            street1: '',
            city: '',
            state: 'FL',
            zip: '',
            ownershipPercentage: filing.entityType === 'LLC' ? 100 : undefined,
          },
        ];

  const [members, setMembers] = useState<Member[]>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const titles = filing.entityType === 'LLC' ? LLC_TITLES : CORP_TITLES;
  const isLLC = filing.entityType === 'LLC';

  const updateMember = (idx: number, patch: Partial<Member>) =>
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const addMember = () =>
    setMembers((prev) => [
      ...prev,
      {
        title: filing.entityType === 'LLC' ? 'AMBR' : 'OFFICER',
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

  const totalOwnership = isLLC
    ? members.reduce((sum, m) => sum + (m.ownershipPercentage ?? 0), 0)
    : 100;

  const valid = members.every((m) => m.name.trim().length > 0);

  const onContinue = () => {
    if (!valid) {
      toast.error('Please add at least one member or officer with a name.');
      return;
    }
    start(async () => {
      const res = await saveStep7({
        filingId: filing.id,
        members: members.map((m) => ({
          ...m,
          ownershipPercentage: m.ownershipPercentage ? Number(m.ownershipPercentage) : undefined,
        })),
      });
      if (!res.ok) {
        toast.error('Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/8`);
    });
  };

  return (
    <div className="space-y-5">
      {members.map((member, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border bg-white p-5 space-y-4 relative"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              {isLLC ? 'Member' : 'Officer / Director'} #{idx + 1}
            </p>
            {members.length > 1 && (
              <button
                type="button"
                onClick={() => removeMember(idx)}
                className="text-ink-subtle hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>
                Title <span className="text-destructive">*</span>
              </Label>
              <Select
                value={member.title}
                onValueChange={(v) => updateMember(idx, { title: v as Member['title'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {titles.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label>
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={member.name}
                onChange={(e) => updateMember(idx, { name: e.target.value })}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label>Address (optional but recommended for banking)</Label>
              <div className="grid grid-cols-6 gap-2">
                <Input
                  className="col-span-6 md:col-span-3"
                  value={member.street1 ?? ''}
                  onChange={(e) => updateMember(idx, { street1: e.target.value })}
                  placeholder="Street address"
                />
                <Input
                  className="col-span-3 md:col-span-1"
                  value={member.city ?? ''}
                  onChange={(e) => updateMember(idx, { city: e.target.value })}
                  placeholder="City"
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
                  placeholder="ZIP"
                  maxLength={10}
                />
              </div>
            </div>

            {isLLC && (
              <div className="space-y-1.5">
                <Label>Ownership %</Label>
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
        Add another {isLLC ? 'member or manager' : 'officer or director'}
      </Button>

      {isLLC && totalOwnership !== 100 && totalOwnership > 0 && (
        <p className="text-xs text-warn flex items-center gap-1.5">
          ⚠ Ownership percentages add up to {totalOwnership.toFixed(1)}%. Make sure they total 100% for clean
          tax filing.
        </p>
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
