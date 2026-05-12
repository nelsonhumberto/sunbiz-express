'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { createCoupon } from '@/actions/coupons';

type CreateAction = typeof createCoupon;

export function CouponCreateForm({ createAction }: { createAction: CreateAction }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await createAction(fd);
      setResult(res);
      if (res.ok) form.reset();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Code */}
        <div className="space-y-1.5">
          <Label htmlFor="code">Code *</Label>
          <Input
            id="code"
            name="code"
            placeholder="LAUNCH20"
            required
            className="uppercase tracking-widest font-mono"
            onChange={(e) => (e.target.value = e.target.value.toUpperCase())}
          />
          <p className="text-xs text-ink-muted">Letters, numbers, dash, underscore</p>
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <Label htmlFor="type">Type *</Label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')}
            className="w-full h-9 rounded-md border border-border bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="PERCENT">Percent off (%)</option>
            <option value="FIXED">Fixed amount ($)</option>
          </select>
        </div>

        {/* Value */}
        <div className="space-y-1.5">
          <Label htmlFor="value">
            {type === 'PERCENT' ? 'Discount (%)' : 'Discount ($)'} *
          </Label>
          <Input
            id="value"
            name="value"
            type="number"
            min="1"
            max={type === 'PERCENT' ? 100 : undefined}
            step={type === 'FIXED' ? '0.01' : '1'}
            placeholder={type === 'PERCENT' ? '20' : '50.00'}
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Description (optional)</Label>
          <Input
            id="description"
            name="description"
            placeholder="Launch promo — 20% off"
          />
        </div>

        {/* Max uses */}
        <div className="space-y-1.5">
          <Label htmlFor="maxUses">Max uses (optional)</Label>
          <Input
            id="maxUses"
            name="maxUses"
            type="number"
            min="1"
            placeholder="Unlimited"
          />
        </div>

        {/* Expires */}
        <div className="space-y-1.5">
          <Label htmlFor="expiresAt">Expiry date (optional)</Label>
          <Input
            id="expiresAt"
            name="expiresAt"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={isPending} className="gap-1.5">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create coupon
        </Button>
        {result?.ok && (
          <span className="text-sm text-success flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Coupon created!
          </span>
        )}
        {result?.error && (
          <span className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-4 w-4" /> {result.error}
          </span>
        )}
      </div>
    </form>
  );
}
