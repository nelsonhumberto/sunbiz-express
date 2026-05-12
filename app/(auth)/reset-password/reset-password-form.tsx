'use client';

import { useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import { resetPassword, type ResetResult } from '@/actions/password-reset';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

const initial: ResetResult = {};

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, formAction] = useFormState(resetPassword, initial);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
        <h1 className="font-display text-2xl font-medium">Invalid link</h1>
        <p className="text-sm text-ink-muted">This reset link is missing or invalid.</p>
        <Link href="/forgot-password">
          <Button className="w-full">Request a new reset link</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Set new password</h1>
        <p className="text-sm text-ink-muted">
          Choose a strong password with at least 8 characters, one uppercase letter, and one number.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className={state.fieldErrors?.password ? 'border-destructive focus-visible:ring-destructive/30' : ''}
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

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className={state.fieldErrors?.confirmPassword ? 'border-destructive focus-visible:ring-destructive/30' : ''}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-muted"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {state.fieldErrors?.confirmPassword && (
            <p className="text-xs text-destructive">{state.fieldErrors.confirmPassword}</p>
          )}
        </div>

        {state.error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {state.error}{' '}
            {state.error.includes('expired') || state.error.includes('used') ? (
              <Link href="/forgot-password" className="underline font-medium">
                Request a new link
              </Link>
            ) : null}
          </div>
        )}

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
      ) : (
        'Set new password'
      )}
    </Button>
  );
}
