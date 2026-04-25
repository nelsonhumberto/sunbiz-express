'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Phone } from 'lucide-react';
import { saveStep8 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeParseJson } from '@/lib/utils';
import type { WizardFiling } from '../types';

export function Step8Correspondence({ filing }: { filing: WizardFiling }) {
  const stored = safeParseJson<{ email?: string; phone?: string } | null>(
    filing.correspondenceContact,
    null
  );
  const [email, setEmail] = useState(stored?.email ?? '');
  const [phone, setPhone] = useState(stored?.phone ?? '');
  const [pending, start] = useTransition();
  const router = useRouter();

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const onContinue = () => {
    start(async () => {
      const res = await saveStep8({ filingId: filing.id, email, phone: phone || undefined });
      if (!res.ok) {
        toast.error('Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/9`);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-white p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-base">
            Correspondence email <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              className="pl-10 h-12 text-base"
              autoComplete="email"
              required
            />
          </div>
          <p className="text-xs text-ink-muted">
            The Florida Department of State will send notices, annual report reminders, and
            confirmation emails to this address.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone (optional)</Label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" />
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (305) 555-1234"
              className="pl-10 h-12 text-base"
              autoComplete="tel"
            />
          </div>
          <p className="text-xs text-ink-muted">
            Useful for urgent compliance alerts. We never share your phone with third parties.
          </p>
        </div>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/7`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
