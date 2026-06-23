'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Loader2, Printer } from 'lucide-react';
import { sendFax, type SendFaxResult } from '@/actions/admin-fax';

const initial: SendFaxResult = {};

export function FaxSendForm({ disabled }: { disabled?: boolean }) {
  const [state, formAction] = useFormState(sendFax, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success('Fax queued for sending.');
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-border bg-white p-5 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Destination fax number
          </span>
          <input
            name="to"
            required
            placeholder="(305) 555-0123"
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <span className="text-[11px] text-ink-subtle">US numbers auto-format to +1.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            PDF to fax
          </span>
          <input
            name="file"
            type="file"
            accept="application/pdf"
            required
            className="text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm hover:file:bg-primary-hover"
          />
          <span className="text-[11px] text-ink-subtle">PDF only · 10 MB max.</span>
        </label>
      </div>
      <SendButton disabled={disabled} />
      {state.error && !state.ok && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}

function SendButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      {pending ? 'Sending…' : 'Send fax'}
    </button>
  );
}
