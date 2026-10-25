'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { CheckCircle2, Mail } from 'lucide-react';
import { captureChecklistSignup } from '@/actions/checklist-signup';
import { Button } from '@/components/ui/button';
import { checklistCopy, type DripLocale } from '@/lib/drip-copy';
import { localizedHref } from '@/lib/locale-paths';

export function ChecklistSignupForm() {
  const locale = useLocale();
  const lang: DripLocale = locale === 'en' ? 'en' : 'es';
  const copy = checklistCopy(lang);
  const privacyHref = localizedHref('/privacy', lang);

  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const nextEmail = String(formData.get('email') ?? '').trim();
    const consent = formData.get('consent') === 'yes';
    const website = String(formData.get('website') ?? '');

    if (!nextEmail) {
      setError(copy.errorEmail);
      return;
    }
    if (!consent) {
      setError(copy.errorConsent);
      return;
    }

    start(async () => {
      const result = await captureChecklistSignup({
        email: nextEmail,
        consent: true,
        locale: lang,
        website,
      });
      if (result.ok) {
        setSubmitted(true);
        return;
      }
      if (result.error === 'invalid-email') setError(copy.errorEmail);
      else if (result.error === 'consent-required') setError(copy.errorConsent);
      else setError(copy.errorGeneric);
    });
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success-subtle/40 p-6 md:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" strokeWidth={2.5} />
          <div>
            <p className="font-display text-xl font-medium leading-tight md:text-2xl">{copy.thanksTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy.thanksBody}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0" noValidate>
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

      <label htmlFor="checklist-email" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-subtle">
        {copy.emailLabel}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <input
            id="checklist-email"
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={copy.emailPlaceholder}
            autoComplete="email"
            inputMode="email"
            required
            disabled={pending}
            className="h-12 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'checklist-signup-error' : undefined}
          />
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:px-6" disabled={pending}>
          {pending ? copy.submitting : copy.button}
        </Button>
      </div>

      <label className="mt-4 flex min-w-0 items-start gap-3 text-sm leading-relaxed text-ink-muted">
        <input
          type="checkbox"
          name="consent"
          value="yes"
          required
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 break-words">
          {copy.consentBefore}
          <a href={privacyHref} className="font-medium text-primary underline-offset-2 hover:underline">
            {copy.consentLink}
          </a>
          {copy.consentAfter}
        </span>
      </label>

      {error && (
        <p id="checklist-signup-error" className="mt-3 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
