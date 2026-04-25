'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { signUpAction, type ActionResult } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const initial: ActionResult = {};

export function SignUpForm() {
  const [state, formAction] = useFormState(signUpAction, initial);
  const [showPwd, setShowPwd] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field name="firstName" label="First name" placeholder="Daniela" error={state.fieldErrors?.firstName} required />
        <Field name="lastName" label="Last name" placeholder="Demo" error={state.fieldErrors?.lastName} required />
      </div>

      <Field
        name="email"
        type="email"
        label="Work email"
        placeholder="you@business.com"
        error={state.fieldErrors?.email}
        required
        autoComplete="email"
      />

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPwd ? 'text' : 'password'}
            placeholder="At least 8 chars, one capital, one number"
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

      <Field
        name="confirmPassword"
        type="password"
        label="Confirm password"
        placeholder="Re-enter your password"
        error={state.fieldErrors?.confirmPassword}
        required
        autoComplete="new-password"
      />

      <div className="flex items-start gap-3 pt-1">
        <Checkbox id="acceptTerms" name="acceptTerms" required />
        <Label htmlFor="acceptTerms" className="text-xs text-ink-muted leading-snug cursor-pointer">
          I agree that Sunbiz Express is not a law firm and does not provide legal advice. I'm
          authorized to provide the information for forming a business.
        </Label>
      </div>

      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating account…
        </>
      ) : (
        'Create my account →'
      )}
    </Button>
  );
}

function Field({
  name,
  label,
  type = 'text',
  placeholder,
  error,
  required,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className={error ? 'border-destructive focus-visible:ring-destructive/30' : ''}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
