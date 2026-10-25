'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { hrefForLocale } from '@/lib/app-href';
import { pickLocale } from '@/lib/pick-locale';
import { claimGuestAccount } from '@/actions/guest-start';
import { saveGuestEmail, sendGuestCheckoutLink } from '@/actions/guest-email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';

/**
 * Checkout account gate. Reuses the guest password claim, and offers a
 * magic link that signs the same draft in at this step.
 */
export function GuestCheckoutAccount({
  filingId,
  email,
  pendingAccountEmail,
  filingLocale,
}: {
  filingId: string;
  email: string;
  pendingAccountEmail?: string;
  filingLocale?: string | null;
}) {
  const t = useTranslations('wizard');
  const locale = pickLocale(useLocale(), filingLocale);
  const [address, setAddress] = useState(email || pendingAccountEmail || '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(Boolean(pendingAccountEmail) && !email);

  const wizardReturn = hrefForLocale(`/wizard/${filingId}/11`, locale);
  const signInHref = hrefForLocale(
    `/sign-in?next=${encodeURIComponent(wizardReturn)}${
      address.trim() ? `&email=${encodeURIComponent(address.trim())}` : ''
    }`,
    locale,
  );

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t('saveExitPasswordInvalid'));
      return;
    }
    setPending(true);
    setError(null);
    setSent(false);
    try {
      const saved = await withActionTimeout(
        saveGuestEmail(filingId, address.trim()),
        WIZARD_ACTION_TIMEOUT_MS,
      );
      if (saved.needsSignIn) {
        setNeedsSignIn(true);
        setError(saved.error ?? t('guestEmailHasAccount'));
        setPending(false);
        return;
      }
      if (!saved.ok) {
        setError(saved.error ?? t('guestEmailInvalid'));
        setPending(false);
        return;
      }
      const fd = new FormData();
      fd.set('email', address.trim());
      fd.set('password', password);
      fd.set('filingId', filingId);
      fd.set('returnStep', '11');
      const claimed = await withActionTimeout(claimGuestAccount({}, fd), WIZARD_ACTION_TIMEOUT_MS);
      if (claimed.needsSignIn) {
        setNeedsSignIn(true);
        setError(claimed.error ?? t('guestEmailHasAccount'));
        setPending(false);
        return;
      }
      if (!claimed.ok) {
        setError(claimed.error ?? t('errorSaveGeneric'));
        setPending(false);
        return;
      }
      window.location.assign(claimed.resumeHref || wizardReturn);
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        window.location.assign(href);
        return;
      }
      if (!isRedirectError(err)) {
        setError(err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorSaveGeneric'));
        setPending(false);
      }
    }
  }

  async function onMagicLink() {
    if (pending) return;
    setPending(true);
    setError(null);
    setSent(false);
    try {
      const result = await withActionTimeout(
        sendGuestCheckoutLink(filingId, address.trim()),
        WIZARD_ACTION_TIMEOUT_MS,
      );
      if (result.needsSignIn) {
        setNeedsSignIn(true);
        setError(result.error ?? t('guestEmailHasAccount'));
        return;
      }
      if (!result.ok || !result.sent) {
        setError(result.error ?? t('guestEmailInvalid'));
        return;
      }
      setNeedsSignIn(false);
      setSent(true);
    } catch (err) {
      if (!isRedirectError(err)) {
        setError(err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorSaveGeneric'));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div id="checkout-account" className="rounded-lg border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-ink">{t('accountGateTitle')}</h3>
        <p className="mt-1 text-sm text-ink-muted leading-relaxed">{t('accountGateBody')}</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {t('accountGateMagicSent')}
        </p>
      )}
      <form onSubmit={onPassword} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-email">{t('accountGateEmail')}</Label>
          <Input
            id="checkout-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setNeedsSignIn(false);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkout-password">{t('accountGatePassword')}</Label>
          <Input
            id="checkout-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-[11px] text-ink-subtle">{t('saveExitPasswordHint')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={pending} className="sm:flex-1">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('accountGateCreate')}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onMagicLink} className="sm:flex-1">
            <Mail className="h-4 w-4" />
            {t('accountGateMagic')}
          </Button>
        </div>
      </form>
      {needsSignIn && (
        <div className="space-y-2 text-sm">
          <p className="text-ink-muted leading-relaxed">{t('accountGateSignIn')}</p>
          <Button asChild variant="outline" className="w-full">
            <a href={signInHref}>{t('accountGateSignInButton')}</a>
          </Button>
        </div>
      )}
    </div>
  );
}
