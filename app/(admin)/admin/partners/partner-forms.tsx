'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { createPartner, setPartnerStatus, updatePartner } from '@/actions/admin-partners';

type CreateAction = typeof createPartner;
type UpdateAction = typeof updatePartner;
type StatusAction = typeof setPartnerStatus;

const fieldClass =
  'w-full h-9 rounded-md border border-border bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30';

function ResultNote({ result }: { result: { ok?: boolean; error?: string } | null }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" /> Saved.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" /> {result.error}
    </p>
  );
}

export function PartnerCreateForm({ createAction }: { createAction: CreateAction }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(null);
    startTransition(async () => {
      const next = await createAction(data);
      setResult(next);
      if (next.ok) form.reset();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PartnerFields />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add partner
        </Button>
        <ResultNote result={result} />
      </div>
    </form>
  );
}

export function PartnerEditForm({
  partner,
  updateAction,
  statusAction,
}: {
  partner: {
    id: string;
    code: string;
    name: string;
    email: string;
    paypalEmail: string | null;
    stripePromotionCodeId: string | null;
    status: 'ACTIVE' | 'PAUSED' | 'REMOVED';
  };
  updateAction: UpdateAction;
  statusAction: StatusAction;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const nextStatus = partner.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      setResult(await updateAction(partner.id, data));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PartnerFields partner={partner} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending || partner.status === 'REMOVED'}
          onClick={() => {
            setResult(null);
            startTransition(async () => {
              setResult(await statusAction(partner.id, nextStatus));
            });
          }}
        >
          {partner.status === 'ACTIVE' ? 'Pause' : 'Resume'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending || partner.status === 'REMOVED'}
          onClick={() => {
            setResult(null);
            startTransition(async () => {
              setResult(await statusAction(partner.id, 'REMOVED'));
            });
          }}
        >
          Remove
        </Button>
        <ResultNote result={result} />
      </div>
    </form>
  );
}

function PartnerFields({
  partner,
}: {
  partner?: {
    code: string;
    name: string;
    email: string;
    paypalEmail: string | null;
    stripePromotionCodeId: string | null;
    status: 'ACTIVE' | 'PAUSED' | 'REMOVED';
  };
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor={partner ? undefined : 'code'}>Code</Label>
        <Input
          id={partner ? undefined : 'code'}
          name="code"
          required
          defaultValue={partner?.code ?? ''}
          placeholder="ADA"
          className="uppercase tracking-widest font-mono"
          onChange={(event) => {
            event.target.value = event.target.value.toUpperCase();
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input name="name" required defaultValue={partner?.name ?? ''} placeholder="Ada Partner" />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input name="email" type="email" required defaultValue={partner?.email ?? ''} />
      </div>
      <div className="space-y-1.5">
        <Label>PayPal email</Label>
        <Input name="paypalEmail" type="email" defaultValue={partner?.paypalEmail ?? ''} placeholder="Optional" />
      </div>
      <div className="space-y-1.5">
        <Label>Stripe promotion code id</Label>
        <Input
          name="stripePromotionCodeId"
          defaultValue={partner?.stripePromotionCodeId ?? ''}
          placeholder="promo_... existing id"
          className="font-mono"
        />
        <p className="text-xs text-ink-muted">Paste an existing Stripe id. This form does not create one.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <select name="status" defaultValue={partner?.status ?? 'ACTIVE'} className={fieldClass}>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="REMOVED">Removed</option>
        </select>
      </div>
    </div>
  );
}
