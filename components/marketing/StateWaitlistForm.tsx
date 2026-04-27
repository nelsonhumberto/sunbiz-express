'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { captureMarketingLead } from '@/actions/marketing-leads';
import { Button } from '@/components/ui/button';
import { localizedStateName, type MarketingState } from '@/lib/marketing-states';
import { cn } from '@/lib/utils';

interface StateWaitlistFormProps {
  state: MarketingState;
  /** Optional analytics source, e.g. "homepage" or "states-route". */
  source?: string;
  /** Optional campaign tag (e.g. utm_campaign). */
  campaign?: string;
  className?: string;
  variant?: 'card' | 'inline';
}

export function StateWaitlistForm({
  state,
  source = 'marketing',
  campaign,
  className,
  variant = 'card',
}: StateWaitlistFormProps) {
  const t = useTranslations('waitlist');
  const locale = useLocale();
  const stateName = localizedStateName(state, locale);

  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      email: String(formData.get('email') ?? '').trim(),
      state: state.code,
      locale,
      source,
      campaign,
      website: String(formData.get('website') ?? ''),
    };

    if (!payload.email) {
      setError(t('errorEmail'));
      return;
    }

    start(async () => {
      const res = await captureMarketingLead(payload);
      if (res.ok) {
        setSubmittedEmail(payload.email);
        setSubmitted(true);
        return;
      }
      switch (res.error) {
        case 'invalid-email':
          setError(t('errorEmail'));
          break;
        case 'invalid-state':
          setError(t('errorState'));
          break;
        case 'duplicate':
          setSubmittedEmail(payload.email);
          setSubmitted(true);
          break;
        default:
          setError(t('errorGeneric'));
      }
    });
  };

  if (submitted) {
    return (
      <div
        className={cn(
          variant === 'card'
            ? 'rounded-2xl border border-success/30 bg-success-subtle/40 p-6 md:p-8'
            : 'rounded-xl border border-success/30 bg-success-subtle/40 p-5',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" strokeWidth={2.5} />
          <div>
            <p className="font-display text-xl md:text-2xl font-medium leading-tight">
              {t('successTitle')}
            </p>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">
              {t('successBody', { email: submittedEmail, state: stateName })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        variant === 'card'
          ? 'rounded-2xl border border-border bg-white p-6 md:p-8 shadow-soft'
          : '',
        className,
      )}
      noValidate
    >
      {variant === 'card' && (
        <div className="mb-5">
          <p className="font-display text-xl md:text-2xl font-medium leading-tight">
            {t('title', { state: stateName })}
          </p>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            {t('subtitle', { state: stateName })}
          </p>
        </div>
      )}

      {/* Honeypot — hidden from real users via aria + style. */}
      <label className="sr-only" aria-hidden="true">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
          style={{ position: 'absolute', left: '-9999px', height: 0, width: 0 }}
        />
      </label>

      <label className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">
        {t('emailLabel')}
      </label>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" />
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            required
            autoComplete="email"
            inputMode="email"
            disabled={pending}
            className="w-full h-12 pl-10 pr-3 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'waitlist-error' : 'waitlist-privacy'}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="sm:px-8"
          disabled={pending || email.trim().length === 0}
        >
          {pending ? t('submitting') : t('submit')}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <p
          id="waitlist-error"
          className="mt-3 text-sm text-destructive font-medium"
          role="alert"
        >
          {error}
        </p>
      )}

      <p
        id="waitlist-privacy"
        className="mt-4 inline-flex items-start gap-1.5 text-xs text-ink-subtle leading-relaxed"
      >
        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
        <span>{t('privacyNote', { state: stateName })}</span>
      </p>
    </form>
  );
}
