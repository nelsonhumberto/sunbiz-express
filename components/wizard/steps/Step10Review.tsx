'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, ShieldAlert } from 'lucide-react';
import { saveStep10 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { safeParseJson, formatDate } from '@/lib/utils';
import type { WizardFiling } from '../types';
import type { AddressValue } from '../AddressForm';

export function Step10Review({ filing }: { filing: WizardFiling }) {
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
    null
  );
  const opt = safeParseJson<{
    effectiveDate?: string;
    authorizedShares?: number;
    businessPurpose?: string;
  } | null>(filing.optionalDetails, null);

  const [signature, setSignature] = useState(filing.incorporatorSignature ?? '');
  const [confirmed, setConfirmed] = useState(filing.confirmationAccepted);
  const [pending, start] = useTransition();
  const router = useRouter();

  const valid = signature.trim().length >= 2 && confirmed;

  const onContinue = () => {
    start(async () => {
      const res = await saveStep10({
        filingId: filing.id,
        signature,
        confirmAccurate: confirmed,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/11`);
    });
  };

  const stepHref = (n: number) => `/wizard/${filing.id}/${n}`;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-warn/30 bg-warn-subtle/40 p-4 flex items-start gap-3 text-sm">
        <ShieldAlert className="h-5 w-5 text-warn shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-ink">Final review</p>
          <p className="text-ink-muted text-xs leading-relaxed">
            Once submitted, the Florida Department of State cannot easily amend your filing — you'd need
            to file a separate amendment. Take a moment to verify everything below.
          </p>
        </div>
      </div>

      {/* Sections */}
      <ReviewSection title="Business basics" stepHref={stepHref(1)} step={1}>
        <Row label="Entity type" value={filing.entityType === 'LLC' ? 'Florida Limited Liability Company' : 'Florida Profit Corporation'} />
        <Row label="Business name" value={filing.businessName ?? '—'} mono />
        <Row label="Service tier" value={filing.serviceTier} />
      </ReviewSection>

      <ReviewSection title="Addresses" stepHref={stepHref(4)} step={4}>
        <Row label="Principal" value={fmtAddr(principal)} />
        <Row
          label="Mailing"
          value={mailingRaw === 'SAME_AS_PRINCIPAL' ? 'Same as principal' : fmtAddr(mailing)}
        />
      </ReviewSection>

      <ReviewSection title="Registered Agent" stepHref={stepHref(6)} step={6}>
        <Row label="Provider" value={ra?.useOurService ? 'Sunbiz Express (Free Year 1)' : 'External agent'} />
        <Row label="Name" value={ra?.name ?? '—'} />
        <Row label="Address" value={fmtAddr(ra ?? null)} />
      </ReviewSection>

      <ReviewSection
        title={filing.entityType === 'LLC' ? 'Members & Managers' : 'Officers & Directors'}
        stepHref={stepHref(7)}
        step={7}
      >
        <ul className="text-sm space-y-1">
          {filing.managersMembers.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 py-1 border-b border-border last:border-b-0">
              <span>
                <span className="text-ink-subtle text-xs uppercase tracking-wider mr-2">{m.title}</span>
                <span className="font-medium">{m.name}</span>
              </span>
              {m.ownershipPercentage != null && (
                <span className="text-xs text-ink-muted">{m.ownershipPercentage.toFixed(1)}%</span>
              )}
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection title="Correspondence" stepHref={stepHref(8)} step={8}>
        <Row label="Email" value={correspondence?.email ?? '—'} mono />
        <Row label="Phone" value={correspondence?.phone ?? '—'} mono />
      </ReviewSection>

      {opt && (opt.effectiveDate || opt.authorizedShares || opt.businessPurpose) && (
        <ReviewSection title="Optional details" stepHref={stepHref(9)} step={9}>
          {opt.effectiveDate && (
            <Row label="Effective date" value={formatDate(opt.effectiveDate)} />
          )}
          {opt.authorizedShares != null && (
            <Row label="Authorized shares" value={opt.authorizedShares.toLocaleString()} />
          )}
          {opt.businessPurpose && <Row label="Business purpose" value={opt.businessPurpose} />}
        </ReviewSection>
      )}

      {/* Signature */}
      <div className="rounded-lg border border-border bg-white p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-ink mb-1">Sign electronically</h3>
          <p className="text-sm text-ink-muted">
            Type your full name as the authorized representative. By doing so, you affirm the
            information is true and accurate, and your typed name has the same legal effect as a
            handwritten signature.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="incorporatorSignature">
            Type your full legal name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="incorporatorSignature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="e.g., Daniela Demo"
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
          <Label htmlFor="confirmAccurate" className="text-sm text-ink-muted leading-relaxed cursor-pointer">
            I confirm that the information above is true, complete, and accurate to the best of my
            knowledge. I understand Sunbiz Express is not a law firm and provides this service as a
            self-help tool.
          </Label>
        </label>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/9`}
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
  step,
  children,
}: {
  title: string;
  stepHref: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-semibold text-ink text-sm">{title}</h3>
        <Link
          href={stepHref}
          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
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

function fmtAddr(a: { street1?: string; street2?: string; city?: string; state?: string; zip?: string } | null | undefined) {
  if (!a || !a.street1) return '—';
  const lines = [a.street1, a.street2, `${a.city ?? ''}, ${a.state ?? ''} ${a.zip ?? ''}`.trim()]
    .filter(Boolean)
    .join(', ');
  return lines;
}
