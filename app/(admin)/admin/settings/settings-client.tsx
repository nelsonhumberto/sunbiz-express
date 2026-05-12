'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { updateStateFees } from '@/actions/admin-email-blast';

interface StateRow {
  id: string;
  stateCode: string;
  stateName: string;
  llcFilingFeeCents: number;
  corpFilingFeeCents: number;
  llcAnnualReportFeeCents: number;
  corpAnnualReportFeeCents: number;
  annualReportLateFeeCents: number;
  expressProcessingFeeCents: number | null;
  enabled: boolean;
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function StateCard({ state }: { state: StateRow }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    // convert dollar inputs → cents
    for (const key of [
      'llcFilingFeeCents',
      'corpFilingFeeCents',
      'llcAnnualReportFeeCents',
      'corpAnnualReportFeeCents',
      'annualReportLateFeeCents',
      'expressProcessingFeeCents',
    ]) {
      const raw = fd.get(key);
      fd.set(key, String(Math.round(Number(raw) * 100)));
    }
    startTransition(async () => {
      const res = await updateStateFees(fd);
      setResult(res);
    });
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">{state.stateName}</h2>
            <p className="text-xs font-mono text-ink-muted">{state.stateCode} · {state.enabled ? 'Active' : 'Coming soon'}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${state.enabled ? 'bg-success/10 text-success' : 'bg-muted text-ink-muted'}`}>
            {state.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="stateId" value={state.id} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`llc-${state.id}`}>LLC filing fee ($)</Label>
              <Input
                id={`llc-${state.id}`}
                name="llcFilingFeeCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(state.llcFilingFeeCents)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`corp-${state.id}`}>Corp filing fee ($)</Label>
              <Input
                id={`corp-${state.id}`}
                name="corpFilingFeeCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(state.corpFilingFeeCents)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`llcar-${state.id}`}>LLC annual report fee ($)</Label>
              <Input
                id={`llcar-${state.id}`}
                name="llcAnnualReportFeeCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(state.llcAnnualReportFeeCents)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`corpar-${state.id}`}>Corp annual report fee ($)</Label>
              <Input
                id={`corpar-${state.id}`}
                name="corpAnnualReportFeeCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(state.corpAnnualReportFeeCents)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`late-${state.id}`}>Late fee ($)</Label>
              <Input
                id={`late-${state.id}`}
                name="annualReportLateFeeCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(state.annualReportLateFeeCents)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`express-${state.id}`}>Expedited filing fee ($)</Label>
              <Input
                id={`express-${state.id}`}
                name="expressProcessingFeeCents"
                type="number"
                step="0.01"
                min="0"
                defaultValue={dollars(state.expressProcessingFeeCents ?? 0)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save fees
            </Button>
            {result?.ok && (
              <span className="text-sm text-success flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            {result?.error && (
              <span className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {result.error}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsClient({ states }: { states: StateRow[] }) {
  const enabled  = states.filter((s) => s.enabled);
  const disabled = states.filter((s) => !s.enabled);

  return (
    <div className="container max-w-5xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Settings — State fees</h1>
        <p className="mt-1 text-ink-muted">
          Update government filing fees per state. Changes take effect immediately for new filings.
          Note: these fees are also hardcoded in <code className="text-xs bg-muted px-1 rounded">lib/formation-states.ts</code> — keep both in sync.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-subtle">Active states</h2>
        {enabled.map((s) => <StateCard key={s.id} state={s} />)}
      </section>

      {disabled.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-subtle">Coming soon</h2>
          {disabled.map((s) => <StateCard key={s.id} state={s} />)}
        </section>
      )}
    </div>
  );
}
