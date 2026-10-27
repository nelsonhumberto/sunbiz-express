'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { openGuestDraft, type DraftNameChoice } from '@/actions/guest-start';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';
import { captureThenNavigate, filingIdFromWizardPath, startNavigationEvents } from '@/lib/analytics';
import { isDeliverableEmail } from '@/lib/email-address';
import { startNameIsAcceptable } from '@/lib/start-draft';

type EntityChoice = 'LLC' | 'CORP' | 'SCORP';

/**
 * /start launch. A guest user and draft are created only when the visitor
 * submits, via the openGuestDraft server action. Loading, prefetch, and
 * crawlers do not create either.
 *
 * One name field on every viewport. Entity defaults to LLC unless the URL
 * already chose one. The link switches between LLC and corporation. There is
 * no availability check here. The name check runs on wizard step 2.
 * An email can be left blank. Continue still opens the draft.
 */
export function GuestStartLaunch({
  defaultState,
  defaultEntity,
  defaultTier,
  defaultBusinessName,
  stateName,
  showOptionalEmail,
}: {
  defaultState: 'FL' | 'WY' | 'DE';
  defaultEntity: EntityChoice;
  defaultTier?: string;
  defaultBusinessName?: string;
  stateName: string;
  showOptionalEmail: boolean;
}) {
  const t = useTranslations('start');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [choice, setChoice] = useState<DraftNameChoice | null>(null);
  const [businessName, setBusinessName] = useState(defaultBusinessName ?? '');
  const [email, setEmail] = useState('');
  const [entity, setEntity] = useState<EntityChoice>(defaultEntity);

  const entityLabel =
    entity === 'SCORP' ? t('entitySCorp') : entity === 'CORP' ? t('entityCorp') : t('entityLLC');
  const nameLabel =
    entity === 'LLC' ? t('nameYourLlc') : entity === 'SCORP' ? t('nameYourSCorp') : t('nameYourCorp');

  async function run(extra?: { draftIntent?: 'resume' | 'new'; draftId?: string; businessName?: string }) {
    setPending(true);
    setFormError(null);
    try {
      const result = await withActionTimeout(
        openGuestDraft({
          state: defaultState,
          entityType: entity,
          tier: defaultTier,
          businessName: extra?.draftIntent === 'resume' ? undefined : (extra?.businessName ?? businessName),
          email: showOptionalEmail ? email.trim() || undefined : undefined,
          draftIntent: extra?.draftIntent,
          draftId: extra?.draftId,
          browserPath: window.location.pathname,
          returnRedirect: true,
        }),
        WIZARD_ACTION_TIMEOUT_MS,
      );
      if (result?.choice) {
        setChoice(result.choice);
        setPending(false);
        return;
      }
      if (result?.redirectTo) {
        const redirectTo = result.redirectTo;
        const filingId = filingIdFromWizardPath(redirectTo);
        await captureThenNavigate({
          events: startNavigationEvents({ filingId, locale, entity }),
          navigate: () => {
            window.location.assign(redirectTo);
          },
        });
        return;
      }
      if (result?.error) {
        setFormError(result.error);
        setPending(false);
      }
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        const filingId = filingIdFromWizardPath(href);
        await captureThenNavigate({
          events: startNavigationEvents({ filingId, locale, entity }),
          navigate: () => {
            window.location.assign(href);
          },
        });
        return;
      }
      if (isRedirectError(err)) return;
      setFormError(err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorStart'));
      setPending(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmed = businessName.trim();
    if (!startNameIsAcceptable(trimmed)) {
      setNameError(t('companyNameInvalid'));
      setFormError(t('companyNameInvalid'));
      return;
    }
    const typedEmail = email.trim();
    if (showOptionalEmail && typedEmail && !isDeliverableEmail(typedEmail)) {
      setEmailError(t('emailOptionalInvalid'));
      setNameError(null);
      setFormError(null);
      return;
    }
    setNameError(null);
    setEmailError(null);
    void run({ businessName: trimmed });
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t('kicker')}</p>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight">
          {t('headline', { state: stateName, entity: entityLabel })}
        </h1>
        <p className="text-sm text-ink-muted max-w-lg mx-auto">{t('subhead')}</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6 md:p-8">
          {choice ? (
            <div role="status" className="space-y-3 text-sm">
              <p className="font-medium">{t('existingDraftTitle')}</p>
              <p className="text-ink-muted leading-relaxed">
                {t('existingDraftBody', {
                  existing: choice.existingName,
                  proposed: choice.proposedName,
                })}
              </p>
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="sm:flex-1"
                  disabled={pending}
                  onClick={() => void run({ draftIntent: 'resume', draftId: choice.draftId })}
                >
                  {t('existingDraftContinue')}
                </Button>
                <Button
                  type="button"
                  className="sm:flex-1"
                  disabled={pending}
                  onClick={() => void run({ draftIntent: 'new', draftId: choice.draftId })}
                >
                  {t('existingDraftStartNew')}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="businessName">{nameLabel}</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  type="text"
                  value={businessName}
                  onChange={(event) => {
                    setBusinessName(event.target.value);
                    if (nameError) {
                      setNameError(null);
                      setFormError(null);
                    }
                  }}
                  autoComplete="organization"
                  autoCapitalize="words"
                  enterKeyHint="go"
                  maxLength={100}
                  placeholder={t('companyNamePlaceholder')}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'start-name-help start-name-error' : 'start-name-help'}
                  className="h-12 text-base"
                />
                <p id="start-name-help" className="text-[11px] text-ink-subtle">
                  {t('nameHelper')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEntity((current) => (current === 'LLC' ? 'CORP' : 'LLC'))}
                className="block text-left text-sm font-medium text-primary hover:underline"
              >
                {entity === 'LLC' ? t('switchToCorp') : t('switchToLlc')}
              </button>

              {showOptionalEmail && (
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="start-email">{t('emailOptional')}</Label>
                  <Input
                    id="start-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    maxLength={254}
                    placeholder={t('emailPlaceholder')}
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? 'start-email-help start-email-error' : 'start-email-help'}
                    className="h-12 text-base"
                  />
                  <p id="start-email-help" className="text-[11px] text-ink-subtle">
                    {t('emailOptionalHint')}
                  </p>
                  {emailError && (
                    <p id="start-email-error" role="alert" className="text-sm text-destructive">
                      {emailError}
                    </p>
                  )}
                </div>
              )}

              {(formError || nameError) && (
                <p
                  id="start-name-error"
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {formError || nameError}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 text-base"
                disabled={pending}
                aria-disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('starting')}
                  </>
                ) : (
                  t('continue')
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
