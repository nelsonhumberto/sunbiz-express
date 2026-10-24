'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@/components/ui/select';
import { startGuestFiling, type StartGuestResult } from '@/actions/guest-start';
import { ACTIVE_FORMATION_STATES } from '@/lib/formation-states';
import { trackSignupStarted } from '@/lib/analytics';
import { getClientUtmAttribution } from '@/lib/utm-client';
import { utmToAnalyticsProps } from '@/lib/utm';
import { ACTIVE_MARKETING_STATES, localizedStateName } from '@/lib/marketing-states';
import { cn } from '@/lib/utils';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';

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
  const router = useRouter();
  const [entity, setEntity] = useState<EntityChoice>(defaultEntity || 'LLC');
  const [filingState, setFilingState] = useState<'FL' | 'WY' | 'DE'>(defaultState || 'FL');
  const [showMissing, setShowMissing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
  const stateMissing = showMissing && !filingState;
  const entityMissing = showMissing && !entity;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !filingState || !entity) {
      setShowMissing(true);
      return;
    }
    if (pending) return;
    setPending(true);
    setFormError(null);
    const utm = getClientUtmAttribution();
    trackSignupStarted({ entry: 'guest_start', ...utmToAnalyticsProps(utm) });
    const fd = new FormData(e.currentTarget);
    try {
      const result = await withActionTimeout(
        startGuestFiling(initial, fd),
        WIZARD_ACTION_TIMEOUT_MS,
      );
      if (result?.error) {
        setFormError(result.error);
        setPending(false);
        return;
      }
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        router.push(href);
        return;
      }
      if (isRedirectError(err)) return;
      setFormError(err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorStart'));
      setPending(false);
    }
  }

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
          <form onSubmit={onSubmit} className="space-y-5">
            {defaultTier && <input type="hidden" name="tier" value={defaultTier} />}
            {defaultBusinessName && (
              <input type="hidden" name="businessName" value={defaultBusinessName} />
            )}
            {/* Radix Select is not a native form control - mirror values into hidden inputs. */}
            <input type="hidden" name="entityType" value={entity} />
            <input type="hidden" name="state" value={filingState} />
            {formError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {formError}
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
                  autoComplete="given-name"
                  aria-required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  aria-invalid={firstMissing}
                  className={cn(
                    firstMissing &&
                      'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
                  )}
                />
                {firstMissing ? <p className="text-xs text-destructive">{t('fieldRequired')}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className={lastMissing ? 'text-destructive' : undefined}>
                  {t('lastName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  autoComplete="family-name"
                  aria-required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  aria-invalid={lastMissing}
                  className={cn(
                    lastMissing &&
                      'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
                  )}
                />
                {lastMissing ? <p className="text-xs text-destructive">{t('fieldRequired')}</p> : null}
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
                autoComplete="email"
                aria-required
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailMissing}
                className={cn(
                  emailMissing &&
                    'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
                )}
              />
              {emailMissing ? (
                <p className="text-xs text-destructive">{t('fieldRequired')}</p>
              ) : (
                <p className="text-[11px] text-ink-subtle">{t('emailHint')}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="state" className={stateMissing ? 'text-destructive' : undefined}>
                  {t('state')}
                </Label>
                <Select
                  value={filingState}
                  onValueChange={(v) => setFilingState(v as 'FL' | 'WY' | 'DE')}
                >
                  <SelectTrigger id="state" aria-required aria-invalid={stateMissing}>
                    <span className="truncate">{stateName}</span>
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
                {stateMissing ? (
                  <p className="text-xs text-destructive">{t('fieldRequired')}</p>
                ) : (
                  <p className="text-[11px] text-ink-subtle">{t('stateHint')}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entityType" className={entityMissing ? 'text-destructive' : undefined}>
                  {t('entityType')}
                </Label>
                <Select value={entity} onValueChange={(v) => setEntity(v as EntityChoice)}>
                  <SelectTrigger id="entityType" aria-required aria-invalid={entityMissing}>
                    <span className="truncate">{entityLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LLC">{t('entityLLC')}</SelectItem>
                    <SelectItem value="CORP">{t('entityCorp')}</SelectItem>
                    <SelectItem value="SCORP">{t('entitySCorp')}</SelectItem>
                  </SelectContent>
                </Select>
                {entityMissing ? <p className="text-xs text-destructive">{t('fieldRequired')}</p> : null}
              </div>
            </div>

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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
