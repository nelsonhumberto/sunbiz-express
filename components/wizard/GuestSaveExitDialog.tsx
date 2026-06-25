'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, Loader2, Mail, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { claimGuestAccount, type ClaimResult } from '@/actions/guest-start';

const initial: ClaimResult = {};

/**
 * Guest-facing "Save & exit" control. Instead of bouncing a guest to the
 * sign-in wall, we offer the lowest-friction account creation: confirm (or
 * edit) the email they already gave us, then save their progress and email a
 * temporary password so they can return any time.
 */
export function GuestSaveExitDialog({
  email,
  label,
}: {
  email: string;
  label: string;
}) {
  const t = useTranslations('wizard');
  const [open, setOpen] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editableEmail, setEditableEmail] = useState(email);
  const [state, formAction] = useFormState(claimGuestAccount, initial);

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
          </DialogHeader>

          {state.ok ? (
            <div className="space-y-4 text-sm">
              <p className="rounded-md bg-success/10 border border-success/20 px-3 py-2.5 text-success inline-flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t('saveExitSuccessBody', { email: editableEmail })}</span>
              </p>
              <Button asChild className="w-full">
                <a href="/">{t('saveExitDone')}</a>
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

              <form action={formAction} className="space-y-3">
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

                <SaveButton label={t('saveExitConfirm')} />
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

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {label}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}
