'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { openGuestDraft, type DraftNameChoice } from '@/actions/guest-start';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';

type EntityChoice = 'LLC' | 'CORP' | 'SCORP';

/**
 * /start launch. A guest user and draft are created only when the visitor
 * submits, via the openGuestDraft server action. Loading, prefetch, and
 * crawlers do not create either.
 */
export function GuestStartLaunch({
  defaultState,
  defaultEntity,
  defaultTier,
  defaultBusinessName,
  stateName,
  entityLabel,
}: {
  defaultState: 'FL' | 'WY' | 'DE';
  defaultEntity: EntityChoice;
  defaultTier?: string;
  defaultBusinessName?: string;
  stateName: string;
  entityLabel: string;
}) {
  const t = useTranslations('start');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [choice, setChoice] = useState<DraftNameChoice | null>(null);

  async function run(extra?: { draftIntent?: 'resume' | 'new'; draftId?: string }) {
    setPending(true);
    setFormError(null);
    try {
      const result = await withActionTimeout(
        openGuestDraft({
          state: defaultState,
          entityType: defaultEntity,
          tier: defaultTier,
          businessName: extra?.draftIntent === 'resume' ? undefined : defaultBusinessName,
          draftIntent: extra?.draftIntent,
          draftId: extra?.draftId,
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

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t('kicker')}</p>
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
          {t('headline', { state: stateName, entity: entityLabel })}
        </h1>
        <p className="text-ink-muted max-w-lg mx-auto">{t('subhead')}</p>
      </div>

      <Card>
        <CardContent className="p-6 md:p-8 space-y-4">
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          )}
          {choice ? (
            <div role="status" className="space-y-3 text-sm">
              <p className="font-medium">{t('existingDraftTitle')}</p>
              <p className="text-ink-muted leading-relaxed">
                {t('existingDraftBody', {
                  existing: choice.existingName,
                  proposed: choice.proposedName,
                })}
              </p>
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
            <div className="space-y-4 text-center">
              <Button
                type="button"
                size="lg"
                className="w-full group"
                disabled={pending}
                onClick={() => void run()}
              >
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
