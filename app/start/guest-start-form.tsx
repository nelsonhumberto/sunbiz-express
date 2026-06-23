'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { startGuestFiling, type StartGuestResult } from '@/actions/guest-start';
import { ACTIVE_FORMATION_STATES, getFormationState } from '@/lib/formation-states';
import { trackSignupStarted } from '@/lib/analytics';
import { getClientUtmAttribution } from '@/lib/utm-client';
import { utmToAnalyticsProps } from '@/lib/utm';

const initial: StartGuestResult = {};

export function GuestStartForm({
  defaultState,
  defaultEntity,
  defaultTier,
}: {
  defaultState: 'FL' | 'WY' | 'DE';
  defaultEntity: 'LLC' | 'CORP';
  /** Preselected package from a pricing CTA (?tier=). Carried through so the
   *  visitor doesn't have to re-pick the package they already chose. */
  defaultTier?: string;
}) {
  const [state, formAction] = useFormState(startGuestFiling, initial);

  return (
    <Card>
      <CardContent className="p-6 md:p-8">
        <form
          action={formAction}
          onSubmit={() => {
            const utm = getClientUtmAttribution();
            trackSignupStarted({ entry: 'guest_start', ...utmToAnalyticsProps(utm) });
          }}
          className="space-y-5"
        >
          {defaultTier && <input type="hidden" name="tier" value={defaultTier} />}
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required autoComplete="given-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required autoComplete="family-name" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@yourcompany.com"
            />
            <p className="text-[11px] text-ink-subtle">
              We&apos;ll save your draft to this email — no password needed yet.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="state">Filing state</Label>
              <Select name="state" defaultValue={defaultState}>
                <SelectTrigger id="state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_FORMATION_STATES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {getFormationState(code).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-ink-subtle">
                You can change this later in the wizard.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entityType">Entity type</Label>
              <Select name="entityType" defaultValue={defaultEntity}>
                <SelectTrigger id="entityType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LLC">LLC</SelectItem>
                  <SelectItem value="CORP">Corporation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full group" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting your draft…
        </>
      ) : (
        <>
          Continue
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </>
      )}
    </Button>
  );
}
