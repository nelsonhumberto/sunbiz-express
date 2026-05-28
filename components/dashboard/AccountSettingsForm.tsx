'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { updateProfile, type UpdateProfileResult } from '@/actions/account-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initial: UpdateProfileResult = {};

interface AccountSettingsFormProps {
  defaultValues: {
    firstName: string;
    lastName: string;
    phone: string;
  };
}

export function AccountSettingsForm({ defaultValues }: AccountSettingsFormProps) {
  const [state, formAction] = useFormState(updateProfile, initial);

  useEffect(() => {
    if (state.ok) toast.success('Saved.');
    if (state.error && !state.fieldErrors) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={defaultValues.firstName}
            required
            className={
              state.fieldErrors?.firstName
                ? 'border-destructive focus-visible:ring-destructive/30'
                : ''
            }
          />
          {state.fieldErrors?.firstName && (
            <p className="text-xs text-destructive">{state.fieldErrors.firstName}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={defaultValues.lastName}
            required
            className={
              state.fieldErrors?.lastName
                ? 'border-destructive focus-visible:ring-destructive/30'
                : ''
            }
          />
          {state.fieldErrors?.lastName && (
            <p className="text-xs text-destructive">{state.fieldErrors.lastName}</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaultValues.phone}
          placeholder="+1 (555) 555-0123"
          className={
            state.fieldErrors?.phone
              ? 'border-destructive focus-visible:ring-destructive/30'
              : ''
          }
        />
        {state.fieldErrors?.phone && (
          <p className="text-xs text-destructive">{state.fieldErrors.phone}</p>
        )}
      </div>

      {state.ok && (
        <p className="text-xs text-success inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Profile updated.
        </p>
      )}
      {state.error && (
        <p className="text-xs text-destructive inline-flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {state.error}
        </p>
      )}

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </>
      ) : (
        'Save changes'
      )}
    </Button>
  );
}
