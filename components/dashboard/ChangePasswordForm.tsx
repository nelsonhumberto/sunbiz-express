'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { changePassword, type ChangePasswordResult } from '@/actions/account-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: ChangePasswordResult = {};

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePassword, initial);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success('Password changed.');
      formRef.current?.reset();
    }
    if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <div className="relative">
          <Input
            id="currentPassword"
            name="currentPassword"
            type={showCurrent ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className={
              state.fieldErrors?.currentPassword
                ? 'border-destructive focus-visible:ring-destructive/30'
                : ''
            }
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-muted"
            aria-label={showCurrent ? 'Hide password' : 'Show password'}
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {state.fieldErrors?.currentPassword && (
          <p className="text-xs text-destructive">{state.fieldErrors.currentPassword}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <div className="relative">
            <Input
              id="newPassword"
              name="newPassword"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className={
                state.fieldErrors?.newPassword
                  ? 'border-destructive focus-visible:ring-destructive/30'
                  : ''
              }
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-muted"
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {state.fieldErrors?.newPassword && (
            <p className="text-xs text-destructive">{state.fieldErrors.newPassword}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            required
            className={
              state.fieldErrors?.confirmPassword
                ? 'border-destructive focus-visible:ring-destructive/30'
                : ''
            }
          />
          {state.fieldErrors?.confirmPassword && (
            <p className="text-xs text-destructive">{state.fieldErrors.confirmPassword}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-subtle">
        Use 8+ characters with at least one uppercase letter and one number.
      </p>

      {state.ok && (
        <p className="text-xs text-success inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Password updated.
        </p>
      )}

      <ChangeButton />
    </form>
  );
}

function ChangeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </>
      ) : (
        'Change password'
      )}
    </Button>
  );
}
