'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { nameHasMinimumSubstance } from '@/lib/name-check';
import { cn } from '@/lib/utils';

type EntityChoice = 'LLC' | 'CORP' | 'SCORP';

/**
 * /start launch. A guest user and draft are created only when the visitor
 * submits, via the openGuestDraft server action. Loading, prefetch, and
 * crawlers do not create either.
 *
 * The company name is the only field collected up front. Entity type is shown when the
 * URL did not already choose one. The button stays enabled while the name is
 * empty so iOS Go and Enter can submit and surface the inline error. It is
 * disabled only while the draft is being created.
 */
export function GuestStartLaunch({
  defaultState,
  defaultEntity,
  defaultTier,
  defaultBusinessName,
  stateName,
  entityLabel,
  askEntity,
}: {
  defaultState: 'FL' | 'WY' | 'DE';
  defaultEntity: EntityChoice;
  defaultTier?: string;
  defaultBusinessName?: string;
  stateName: string;
  entityLabel: string;
  askEntity: boolean;
}) {
  const t = useTranslations('start');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [choice, setChoice] = useState<DraftNameChoice | null>(null);
  const [businessName, setBusinessName] = useState(defaultBusinessName ?? '');
  const [entity, setEntity] = useState<EntityChoice>(defaultEntity);

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
          draftIntent: extra?.draftIntent,
          draftId: extra?.draftId,
          browserPath: window.location.pathname,
        }),
        WIZARD_ACTION_TIMEOUT_MS,
      );
      if (result?.choice) {
        setChoice(result.choice);
        setPending(false);
        return;
      }
      if (result?.error) {
        setFormError(result.error);
        setPending(false);
      }
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        window.location.assign(href);
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
    if (!nameHasMinimumSubstance(trimmed)) {
      setNameError(t('companyNameInvalid'));
      setFormError(t('companyNameInvalid'));
      return;
    }
    setNameError(null);
    void run({ businessName: trimmed });
  }

  const entities: { value: EntityChoice; label: string }[] = [
    { value: 'LLC', label: t('entityLLC') },
    { value: 'CORP', label: t('entityCorp') },
    { value: 'SCORP', label: t('entitySCorp') },
  ];

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
                <Label htmlFor="businessName">{t('companyName')}</Label>
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
                  aria-describedby={nameError ? 'start-name-error' : undefined}
                  className="h-12 text-base"
                />
              </div>

              {askEntity && (
                <fieldset className="space-y-1.5 text-left">
                  <legend className="text-sm font-medium">{t('entityType')}</legend>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('entityType')}>
                    {entities.map((option) => {
                      const active = entity === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setEntity(option.value)}
                          className={cn(
                            'h-11 rounded-lg border text-sm font-semibold',
                            active
                              ? 'border-primary bg-primary text-white'
                              : 'border-border bg-white text-ink',
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
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
