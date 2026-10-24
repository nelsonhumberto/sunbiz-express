'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { signInAction, type ActionResult } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
} from '@/lib/action-timeout';

export function SignInForm({
  defaultEmail = '',
  nextHref = '',
}: {
  defaultEmail?: string;
  nextHref?: string;
}) {
  const t = useTranslations('auth');
  const [state, setState] = useState<ActionResult>({});
  const [pending, setPending] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setState({});
    const fd = new FormData(e.currentTarget);
    try {
      // Wrong passwords return from the server immediately. This cap only
      // covers a hung credentials callback so the button does not spin ~30s.
      const result = await withActionTimeout(signInAction({}, fd), 8_000);
      if (result?.error || result?.fieldErrors) {
        setState(result);
        setPending(false);
        return;
      }
      setPending(false);
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        window.location.assign(href);
        return;
      }
      if (isRedirectError(err)) return;
      setState({
        error: err instanceof ActionTimeoutError ? t('errorGeneric') : t('errorGeneric'),
      });
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {nextHref && <input type="hidden" name="next" value={nextHref} />}
      <div className="space-y-1.5">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@business.com"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
        />
        {state.fieldErrors?.email && (
          <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('password')}</Label>
          <Link href="/forgot-password" className="text-xs text-ink-muted hover:text-primary">
            {t('forgotPassword')}
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPwd ? 'text' : 'password'}
            placeholder=""
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-muted"
            aria-label={showPwd ? 'Hide password' : 'Show password'}
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {state.fieldErrors?.password && (
          <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
        )}
      </div>

      {state.error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('signingIn')}
          </>
        ) : (
          t('signInButton')
        )}
      </Button>
    </form>
  );
}
