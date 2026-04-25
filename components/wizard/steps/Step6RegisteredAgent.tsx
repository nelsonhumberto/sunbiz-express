'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, Building2, Info } from 'lucide-react';
import { saveStep6 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { safeParseJson, cn } from '@/lib/utils';
import { isPoBox } from '@/lib/florida';
import type { WizardFiling } from '../types';

interface RAStored extends AddressValue {
  type?: string;
  useOurService?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  signature?: string;
}

const INTERNAL_AGENT = {
  name: 'Sunbiz Express RA Services LLC',
  email: 'agent@sunbizexpress.example',
  phone: '+1 (305) 555-0100',
  street1: '1234 Sunshine Boulevard',
  street2: 'Suite 200',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
};

export function Step6RegisteredAgent({ filing }: { filing: WizardFiling }) {
  const stored = safeParseJson<RAStored | null>(filing.registeredAgent, null);
  const [useOurService, setUseOurService] = useState(stored?.useOurService ?? true);
  const [external, setExternal] = useState({
    name: stored?.useOurService ? '' : stored?.name ?? '',
    email: stored?.useOurService ? '' : stored?.email ?? '',
    phone: stored?.useOurService ? '' : stored?.phone ?? '',
    address: {
      street1: stored?.useOurService ? '' : stored?.street1 ?? '',
      street2: stored?.useOurService ? '' : stored?.street2 ?? '',
      city: stored?.useOurService ? '' : stored?.city ?? '',
      state: 'FL',
      zip: stored?.useOurService ? '' : stored?.zip ?? '',
    } as AddressValue,
  });
  const [signature, setSignature] = useState(stored?.signature ?? '');
  const [pending, start] = useTransition();
  const router = useRouter();

  const externalValid =
    !useOurService &&
    external.name.trim().length > 0 &&
    external.address.street1.trim().length > 0 &&
    external.address.city.trim().length > 0 &&
    external.address.zip.trim().length > 0 &&
    !isPoBox(external.address.street1);

  const canContinue = (useOurService || externalValid) && signature.trim().length >= 2;

  const onContinue = () => {
    start(async () => {
      const payload = useOurService
        ? {
            filingId: filing.id,
            useOurService: true,
            name: INTERNAL_AGENT.name,
            email: INTERNAL_AGENT.email,
            phone: INTERNAL_AGENT.phone,
            street1: INTERNAL_AGENT.street1,
            street2: INTERNAL_AGENT.street2,
            city: INTERNAL_AGENT.city,
            state: 'FL',
            zip: INTERNAL_AGENT.zip,
            signature,
          }
        : {
            filingId: filing.id,
            useOurService: false,
            name: external.name,
            email: external.email,
            phone: external.phone,
            street1: external.address.street1,
            street2: external.address.street2 ?? '',
            city: external.address.city,
            state: 'FL',
            zip: external.address.zip,
            signature,
          };
      const res = await saveStep6(payload);
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/7`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setUseOurService(true)}
          className={cn(
            'relative text-left rounded-2xl border-2 p-5 transition-all',
            useOurService
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border bg-white hover:border-primary/30'
          )}
        >
          <Badge variant="success" className="absolute -top-3 left-5">
            Free Year 1
          </Badge>
          <div className="flex items-start gap-3 mb-2">
            <div className="h-11 w-11 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Use our Registered Agent</h3>
              <p className="text-xs text-ink-muted mt-0.5">Recommended for most owners</p>
            </div>
          </div>
          <ul className="text-xs text-ink-muted space-y-1 mt-2">
            <li>· Florida physical address provided</li>
            <li>· Service of process scanned & forwarded</li>
            <li>· Year-1 free, then $119/year (cancel anytime)</li>
            <li>· Keeps your home address off the public record</li>
          </ul>
        </button>

        <button
          type="button"
          onClick={() => setUseOurService(false)}
          className={cn(
            'relative text-left rounded-2xl border-2 p-5 transition-all',
            !useOurService
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border bg-white hover:border-primary/30'
          )}
        >
          <div className="flex items-start gap-3 mb-2">
            <div className="h-11 w-11 rounded-xl bg-muted text-ink-muted flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Use my own agent</h3>
              <p className="text-xs text-ink-muted mt-0.5">An individual or third-party service</p>
            </div>
          </div>
          <ul className="text-xs text-ink-muted space-y-1 mt-2">
            <li>· Must have a Florida physical address (no P.O. Box)</li>
            <li>· Must consent to acting as agent</li>
            <li>· Available during business hours</li>
            <li>· You'll need to update Florida if they change</li>
          </ul>
        </button>
      </div>

      {/* Internal agent display */}
      {useOurService && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-primary">Your Registered Agent</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-subtle uppercase tracking-wider mb-1">Name</p>
              <p className="font-medium">{INTERNAL_AGENT.name}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle uppercase tracking-wider mb-1">Address</p>
              <p className="font-medium leading-tight">
                {INTERNAL_AGENT.street1}, {INTERNAL_AGENT.street2}
                <br />
                {INTERNAL_AGENT.city}, {INTERNAL_AGENT.state} {INTERNAL_AGENT.zip}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* External agent form */}
      {!useOurService && (
        <div className="space-y-5 rounded-lg border border-border bg-white p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="raName">
                Agent name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="raName"
                value={external.name}
                onChange={(e) => setExternal({ ...external, name: e.target.value })}
                placeholder="Jane Doe or Doe Registered Agent Services LLC"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raEmail">Agent email</Label>
              <Input
                id="raEmail"
                type="email"
                value={external.email}
                onChange={(e) => setExternal({ ...external, email: e.target.value })}
                placeholder="agent@example.com"
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">
              Florida physical address <span className="text-destructive">*</span>
            </Label>
            <AddressForm
              value={external.address}
              onChange={(v) => setExternal({ ...external, address: v })}
              floridaOnly
              prefix="ra-"
            />
            {external.address.street1 && isPoBox(external.address.street1) && (
              <p className="text-xs text-destructive mt-2">
                P.O. Boxes are not allowed for registered agents — Florida law requires a physical
                street address.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Signature */}
      <div className="space-y-2 pt-3 border-t border-border">
        <div className="flex items-start gap-2 text-sm text-ink-muted">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p>
            By typing the agent's name below, you confirm they accept the appointment as Registered
            Agent and agree to act in this capacity. This is a legally binding electronic signature.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signature">
            Type the agent's name to sign <span className="text-destructive">*</span>
          </Label>
          <Input
            id="signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={useOurService ? 'Type "Sunbiz Express RA Services LLC"' : 'Type the agent\'s name'}
            className="font-display text-lg italic"
          />
        </div>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/5`}
        onNext={onContinue}
        nextDisabled={!canContinue}
        pending={pending}
      />
    </div>
  );
}
