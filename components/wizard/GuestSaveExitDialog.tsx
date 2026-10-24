'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Loader2, Mail, CheckCircle2, ArrowRight } from 'lucide-react';
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
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';

/**
 * Guest "Save & exit". The customer sets a password here, stays signed in,
 * and gets a link back to the same draft. No temporary password is emailed.
 */
export function GuestSaveExitDialog({
  email,
  label,
  filingId,
}: {
  email: string;
  label: string;
  filingId: string;
}) {
  const t = useTranslations('wizard');
  const [open, setOpen] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editableEmail, setEditableEmail] = useState(email);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ClaimResult>({});

  const resumeHref = state.resumeHref || `/wizard/${filingId}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setState({ error: t('saveExitPasswordInvalid'), fieldErrors: { password: t('saveExitPasswordInvalid') } });
      return;
    }
    setPending(true);
    setState({});
    const fd = new FormData(e.currentTarget);
    try {
      const result = await withActionTimeout(claimGuestAccount({}, fd), WIZARD_ACTION_TIMEOUT_MS);
      setState(result);
      if (result.ok && result.signedIn && result.resumeHref) {
        window.setTimeout(() => {
          window.location.assign(result.resumeHref!);
        }, 1200);
      }
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
      >
        <X className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {state.ok ? t('saveExitSuccessTitle') : t('saveExitTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {state.ok ? t('saveExitSuccessTitle') : t('saveExitBody')}
            </DialogDescription>
          </DialogHeader>

          {state.ok ? (
            <div className="space-y-4 text-sm">
              <p className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-success inline-flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {state.signedIn
                    ? t('saveExitSuccessBody', { email: editableEmail })
                    : t('saveExitSuccessGuest', { email: editableEmail })}
                </span>
              </p>
              <Button asChild className="w-full">
                <a href={resumeHref}>{t('saveExitResume')}</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-ink-muted leading-relaxed">{t('saveExitBody')}</p>

              {state.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                  {state.error}
                </p>
              )}

              <form onSubmit={onSubmit} className="space-y-3">
                <input type="hidden" name="filingId" value={filingId} />
                {showEmailEditor ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="save-exit-email">{t('saveExitEmailLabel')}</Label>
                    <Input
                      id="save-exit-email"
                      name="email"
                      type="email"
                      required
                      value={editableEmail}
                      onChange={(e) => setEditableEmail(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <input type="hidden" name="email" value={editableEmail} />
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 flex items-center justify-between gap-3">
                      <span className="font-medium text-ink truncate">{editableEmail}</span>
                      <button
                        type="button"
                        onClick={() => setShowEmailEditor(true)}
                        className="text-xs font-medium text-primary hover:underline shrink-0"
                      >
                        {t('saveExitChangeEmail')}
                      </button>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="save-exit-password">{t('saveExitPasswordLabel')}</Label>
                  <Input
                    id="save-exit-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-[11px] text-ink-subtle">{t('saveExitPasswordHint')}</p>
                </div>

                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('saveExitSigningIn')}
                    </>
                  ) : (
                    <>
                      {t('saveExitConfirm')}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full text-center text-xs text-ink-subtle hover:text-ink-muted"
                >
                  {t('saveExitKeepGoing')}
                </button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
