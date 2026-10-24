'use client';

import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, FolderOpen, KeyRound, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { claimGuestAccount, type ClaimResult } from '@/actions/guest-start';
import { getClientUtmAttribution } from '@/lib/utm-client';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';

const DISMISS_KEY = 'lf_guest_prompt_seen';

interface Props {
  firstName: string;
  email: string;
  filingId: string;
}

/**
 * One-time popup asking a guest to set a password and keep the draft.
 * Dismissal is stored in localStorage. A failed sign-in does not send them
 * to /sign-in; the guest cookie still opens this filing.
 */
export function GuestAccountPrompt({ firstName, email, filingId }: Props) {
  const t = useTranslations('wizard');
  const [open, setOpen] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editableEmail, setEditableEmail] = useState(email);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ClaimResult>({});

  const resumeHref = state.resumeHref || `/wizard/${filingId}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(DISMISS_KEY);
    if (seen) return;
    const isAdTraffic = !!getClientUtmAttribution();
    const delay = isAdTraffic ? 45_000 : 1_200;
    const timer = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!state.ok || !state.signedIn || !state.resumeHref) return;
    const timer = window.setTimeout(() => {
      window.location.assign(state.resumeHref!);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [state.ok, state.signedIn, state.resumeHref]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setState({ error: t('saveExitPasswordInvalid') });
      return;
    }
    setPending(true);
    setState({});
    const fd = new FormData(e.currentTarget);
    try {
      const result = await withActionTimeout(claimGuestAccount({}, fd), WIZARD_ACTION_TIMEOUT_MS);
      setState(result);
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        window.location.assign(href);
        return;
      }
      if (!isRedirectError(err)) {
        setState({
          error: err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorSaveGeneric'),
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('saveExitTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('saveExitBody')}</DialogDescription>
        </DialogHeader>

        {state.ok ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-success/10 border border-success/20 px-3 py-2 text-success">
              {state.signedIn
                ? t('saveExitSuccessBody', { email: editableEmail })
                : t('saveExitSuccessGuest', { email: editableEmail })}
            </p>
            <Button asChild className="w-full">
              <a href={resumeHref}>{t('saveExitResume')}</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted leading-relaxed">
              {t('saveExitBody')}
            </p>
            <ul className="space-y-2">
              <Benefit icon={<ShieldCheck className="h-4 w-4 text-primary" />}>
                {t('saveExitBenefitDashboard')}
              </Benefit>
              <Benefit icon={<FolderOpen className="h-4 w-4 text-primary" />}>
                {t('saveExitBenefitDocuments')}
              </Benefit>
              <Benefit icon={<KeyRound className="h-4 w-4 text-primary" />}>
                {t('saveExitPasswordHint')}
              </Benefit>
            </ul>

            {state.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                {state.error}
              </p>
            )}

            <form onSubmit={onSubmit} className="space-y-3 pt-2">
              <input type="hidden" name="filingId" value={filingId} />
              {showEmailEditor ? (
                <div className="space-y-1.5">
                  <Label htmlFor="claim-email">{t('saveExitEmailLabel')}</Label>
                  <Input
                    id="claim-email"
                    name="email"
                    type="email"
                    required
                    value={editableEmail}
                    onChange={(e) => setEditableEmail(e.target.value)}
                  />
                </div>
              ) : (
                <input type="hidden" name="email" value={editableEmail} />
              )}

              <div className="space-y-1.5">
                <Label htmlFor="claim-password">{t('saveExitPasswordLabel')}</Label>
                <Input
                  id="claim-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button type="submit" size="sm" disabled={pending} className="text-xs">
                  {pending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('saveExitSigningIn')}
                    </>
                  ) : (
                    t('saveExitConfirm')
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmailEditor((v) => !v)}
                  className="text-xs"
                >
                  {showEmailEditor ? t('saveExitChangeEmail') : t('saveExitChangeEmail')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={dismiss}
                  className="text-xs"
                >
                  {t('saveExitKeepGoing')}
                </Button>
              </div>
              <p className="text-[11px] text-ink-subtle text-center">
                {firstName ? `${firstName}, you` : 'You'} can keep filing as a guest and create an account later.
              </p>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Benefit({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-ink-muted leading-snug">{children}</span>
    </li>
  );
}
