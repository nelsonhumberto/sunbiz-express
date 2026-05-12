'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requestPasswordReset, type ForgotResult } from '@/actions/password-reset';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: ForgotResult = {};

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordReset, initial);

  if (state.ok) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center space-y-3 py-4">
          <div className="h-12 w-12 rounded-full bg-success/15 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <h1 className="font-display text-2xl font-medium">Check your email</h1>
          <p className="text-sm text-ink-muted max-w-sm">
            If that email is in our system, you'll receive a password reset link within a few minutes. Check your spam folder if you don't see it.
          </p>
        </div>
        <Link href="/sign-in">
          <Button variant="outline" className="w-full gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight">Forgot password?</h1>
        <p className="text-sm text-ink-muted">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@business.com"
            autoComplete="email"
            required
          />
        </div>

        {state.error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <SubmitButton />
      </form>

      <Link
        href="/sign-in"
        className="flex items-center justify-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full gap-2" size="lg" disabled={pending}>
      {pending ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
      ) : (
        <><Mail className="h-4 w-4" /> Send reset link</>
      )}
    </Button>
  );
}
