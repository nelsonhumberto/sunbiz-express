'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Sparkles, ShieldCheck, Mail, KeyRound, Loader2 } from 'lucide-react';
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

const DISMISS_KEY = 'lf_guest_prompt_seen';
const initial: ClaimResult = {};

interface Props {
  firstName: string;
  email: string;
}

/**
 * One-time popup shown to guest visitors asking whether they want to convert
 * their guest session into a real account. The popup persists its dismissed
 * state in localStorage so we never nag returning users.
 */
export function GuestAccountPrompt({ firstName, email }: Props) {
  const [open, setOpen] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editableEmail, setEditableEmail] = useState(email);
  const [state, formAction] = useFormState(claimGuestAccount, initial);
  const [waiting, startWait] = useTransition();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(DISMISS_KEY);
    if (seen) return;
    // Slight delay so the popup doesn't slam in on first paint.
    const timer = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
    setOpen(false);
  }

  // Auto-close on successful claim, with a short pause to show the message.
  useEffect(() => {
    if (state.ok) {
      startWait(() => {
        setTimeout(() => dismiss(), 1500);
      });
    }
  }, [state.ok]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Save your draft with a free LaunchForma account?
          </DialogTitle>
        </DialogHeader>

        {state.ok ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-success/10 border border-success/20 px-3 py-2 text-success">
              {state.message}
            </p>
            <p className="text-ink-muted">
              You can keep filing right where you left off. We&apos;ll get you out of the way.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted leading-relaxed">
              Hi {firstName || 'there'} — you&apos;re continuing as a guest. Creating a free
              account gets you:
            </p>
            <ul className="space-y-2">
              <Benefit icon={<ShieldCheck className="h-4 w-4 text-primary" />}>
                A personal dashboard to resume your filing on any device.
              </Benefit>
              <Benefit icon={<Mail className="h-4 w-4 text-primary" />}>
                Email confirmations, document downloads, and compliance reminders.
              </Benefit>
              <Benefit icon={<KeyRound className="h-4 w-4 text-primary" />}>
                Secure access — we&apos;ll email you a temporary password you can change anytime.
              </Benefit>
            </ul>

            {state.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                {state.error}
              </p>
            )}

            <form action={formAction} className="space-y-3 pt-2">
              {showEmailEditor ? (
                <div className="space-y-1.5">
                  <Label htmlFor="claim-email">Email for your account</Label>
                  <Input
                    id="claim-email"
                    name="email"
                    type="email"
                    required
                    value={editableEmail}
                    onChange={(e) => setEditableEmail(e.target.value)}
                  />
                  <p className="text-[11px] text-ink-subtle">
                    We&apos;ll email your sign-in credentials here.
                  </p>
                </div>
              ) : (
                <input type="hidden" name="email" value={editableEmail} />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <ClaimButton label={`Yes, create my account`} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmailEditor((v) => !v)}
                  className="text-xs"
                >
                  {showEmailEditor ? 'Use original email' : 'Change email'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={dismiss}
                  className="text-xs"
                >
                  No, continue as guest
                </Button>
              </div>
              <p className="text-[11px] text-ink-subtle text-center">
                You can always create an account later from any wizard step.
              </p>
              {waiting && (
                <p className="flex items-center justify-center gap-2 text-xs text-ink-muted">
                  <Loader2 className="h-3 w-3 animate-spin" /> Closing…
                </p>
              )}
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

function ClaimButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="text-xs">
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Creating…
        </>
      ) : (
        label
      )}
    </Button>
  );
}
