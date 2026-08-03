'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
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
import { ACTIVE_FORMATION_STATES } from '@/lib/formation-states';
import { trackSignupStarted } from '@/lib/analytics';
import { getClientUtmAttribution } from '@/lib/utm-client';
import { utmToAnalyticsProps } from '@/lib/utm';
import { ACTIVE_MARKETING_STATES, localizedStateName } from '@/lib/marketing-states';
import { cn } from '@/lib/utils';

const initial: StartGuestResult = {};

type EntityChoice = 'LLC' | 'CORP' | 'SCORP';

export function GuestStartForm({
  defaultState,
  defaultEntity,
  defaultTier,
  defaultBusinessName,
}: {
  defaultState: 'FL' | 'WY' | 'DE';
  defaultEntity: EntityChoice;
  /** Preselected package from a pricing CTA (?tier=). Carried through so the
   *  visitor doesn't have to re-pick the package they already chose. */
  defaultTier?: string;
  /** Business name prefilled by the assistant (?name=) so the draft is seeded. */
  defaultBusinessName?: string;
}) {
  const t = useTranslations('start');
  const locale = useLocale();
  const [state, formAction] = useFormState(startGuestFiling, initial);
  const [entity, setEntity] = useState<EntityChoice>(defaultEntity);
  const [filingState, setFilingState] = useState<'FL' | 'WY' | 'DE'>(defaultState);
  const [showMissing, setShowMissing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  const entityLabel = useMemo(() => {
    if (entity === 'SCORP') return t('entitySCorp');
    if (entity === 'CORP') return t('entityCorp');
    return t('entityLLC');
  }, [entity, t]);

  const stateName = useMemo(() => {
    const ms = ACTIVE_MARKETING_STATES.find((s) => s.code === filingState);
    return ms ? localizedStateName(ms, locale) : filingState;
  }, [filingState, locale]);

  const firstMissing = showMissing && !firstName.trim();
  const lastMissing = showMissing && !lastName.trim();
  const emailMissing = showMissing && !email.trim();

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {t('kicker')}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
          {t('headline', { state: stateName, entity: entityLabel })}
        </h1>
        <p className="text-ink-muted max-w-lg mx-auto">{t('subhead')}</p>
      </div>

      <Card>
        <CardContent className="p-6 md:p-8">
          <form
            action={formAction}
            onSubmit={(e) => {
              if (!firstName.trim() || !lastName.trim() || !email.trim()) {
                e.preventDefault();
                setShowMissing(true);
                return;
              }
              const utm = getClientUtmAttribution();
              trackSignupStarted({ entry: 'guest_start', ...utmToAnalyticsProps(utm) });
            }}
            className="space-y-5"
          >
            {defaultTier && <input type="hidden" name="tier" value={defaultTier} />}
            {defaultBusinessName && (
              <input type="hidden" name="businessName" value={defaultBusinessName} />
            )}
            {/* Radix Select is not a native form control — mirror values into hidden inputs. */}
            <input type="hidden" name="entityType" value={entity} />
            <input type="hidden" name="state" value={filingState} />
            {state.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            {showMissing && (firstMissing || lastMissing || emailMissing) && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {t('missingFields')}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className={firstMissing ? 'text-destructive' : undefined}>
                  {t('firstName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  name="firstName"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  aria-invalid={firstMissing}
                  className={cn(
                    firstMissing &&
                      'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className={lastMissing ? 'text-destructive' : undefined}>
                  {t('lastName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  aria-invalid={lastMissing}
                  className={cn(
                    lastMissing &&
                      'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className={emailMissing ? 'text-destructive' : undefined}>
                {t('email')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailMissing}
                className={cn(
                  emailMissing &&
                    'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
                )}
              />
              <p className="text-[11px] text-ink-subtle">{t('emailHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="state">{t('state')}</Label>
                <Select
                  value={filingState}
                  onValueChange={(v) => setFilingState(v as 'FL' | 'WY' | 'DE')}
                >
                  <SelectTrigger id="state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVE_MARKETING_STATES.filter((s) =>
                      (ACTIVE_FORMATION_STATES as readonly string[]).includes(s.code),
                    ).map((ms) => (
                      <SelectItem key={ms.code} value={ms.code}>
                        {localizedStateName(ms, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-ink-subtle">{t('stateHint')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entityType">{t('entityType')}</Label>
                <Select value={entity} onValueChange={(v) => setEntity(v as EntityChoice)}>
                  <SelectTrigger id="entityType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LLC">{t('entityLLC')}</SelectItem>
                    <SelectItem value="CORP">{t('entityCorp')}</SelectItem>
                    <SelectItem value="SCORP">{t('entitySCorp')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <SubmitButton />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmitButton() {
  const t = useTranslations('start');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full group" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('starting')}
        </>
      ) : (
        <>
          {t('continue')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </>
      )}
    </Button>
  );
}
