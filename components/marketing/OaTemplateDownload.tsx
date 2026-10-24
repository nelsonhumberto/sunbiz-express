'use client';

import { useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import type { OaDownloadCopy } from '@/lib/oa-guide-copy';
import { localizedHref } from '@/lib/locale-paths';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OaTemplateDownload({
  enabled,
  locale,
  copy,
}: {
  enabled: boolean;
  locale: 'en' | 'es';
  copy: OaDownloadCopy;
}) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  if (!enabled) {
    return (
      <section className="not-prose my-10 rounded-2xl border border-border bg-white p-6">
        <p className="text-sm font-medium text-ink">{copy.sampleHeader}</p>
        <p className="mt-3 text-sm text-ink-muted">{copy.comingSoon}</p>
      </section>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextEmail = email.trim();
    if (!EMAIL_RE.test(nextEmail) || nextEmail.includes('..')) {
      setError(copy.invalidEmail);
      return;
    }
    if (!consent) {
      setError(copy.consentRequired);
      return;
    }
    setError(null);
    setPending(true);
    let result: { ok?: boolean; error?: string } = {};
    try {
      const response = await fetch('/api/leads/oa-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: nextEmail,
          locale,
          consent: true,
          website,
        }),
      });
      result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setPending(false);
        setError(
          result.error === 'invalid-email'
            ? copy.invalidEmail
            : result.error === 'consent'
              ? copy.consentRequired
              : copy.genericError,
        );
        return;
      }
    } catch {
      setPending(false);
      setError(copy.genericError);
      return;
    }
    setPending(false);
    trackEvent('oa_template_submit', { locale, source: 'oa-template' }, { sendInstantly: true });
    setDone(true);
  }

  return (
    <section className="not-prose my-10 rounded-2xl border border-border bg-white p-6">
      <p className="text-sm font-medium text-ink">{copy.sampleHeader}</p>
      <h2 className="mt-2 font-display text-2xl font-medium text-ink">{copy.heading}</h2>
      <p className="mt-2 text-sm text-ink-muted">{copy.subhead}</p>
      {done ? (
        <p className="mt-4 text-sm font-medium text-ink">{copy.success}</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor="oa-template-email" className="block text-sm font-medium text-ink">
              {copy.emailLabel}
            </label>
            <input
              id="oa-template-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm text-ink"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="consent"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
              required
            />
            <span>
              {copy.consentBefore}{' '}
              <a href={localizedHref(copy.privacyHref, locale)} className="text-primary underline">
                {copy.privacyLabel}
              </a>
              .
            </span>
          </label>
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <label>
              Company website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {copy.button}
          </button>
        </form>
      )}
      <p className="mt-3 text-xs text-ink-subtle">{copy.note}</p>
    </section>
  );
}
