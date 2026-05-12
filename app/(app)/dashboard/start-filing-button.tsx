'use client';

import { Plus, ChevronDown, MapPin } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createFiling } from '@/actions/filings';
import { cn } from '@/lib/utils';

const STATES = [
  { code: 'FL', name: 'Florida', flag: 'FL' },
  { code: 'WY', name: 'Wyoming', flag: 'WY' },
  { code: 'DE', name: 'Delaware', flag: 'DE' },
] as const;

interface StartFilingButtonProps {
  entityType?: 'LLC' | 'CORP';
  state?: string;
}

export function StartFilingButton({ entityType, state: initialState }: StartFilingButtonProps) {
  const t = useTranslations('dashboard');
  const [pending, start] = useTransition();
  const [selectedState, setSelectedState] = useState(
    STATES.find((s) => s.code === initialState?.toUpperCase()) ?? STATES[0],
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-stretch">
      <form
        action={async () => {
          start(async () => {
            await createFiling({ entityType, state: selectedState.code });
          });
        }}
        className="flex-1"
      >
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="group rounded-r-none w-full"
        >
          <Plus className="h-4 w-4" />
          {pending ? t('starting') : t('startFiling')}
        </Button>
      </form>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'h-full px-3 flex items-center gap-1.5 rounded-r-lg border-l border-white/20',
            'bg-primary text-white hover:bg-primary-hover transition-colors text-sm font-medium',
          )}
          aria-label="Select formation state"
        >
          <MapPin className="h-3.5 w-3.5" />
          {selectedState.code}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-border bg-white shadow-lg py-1">
              {STATES.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => {
                    setSelectedState(s);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-muted transition-colors',
                    selectedState.code === s.code && 'bg-primary/5 text-primary font-medium',
                  )}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-bold text-ink-muted shrink-0">
                    {s.flag}
                  </span>
                  <span>{s.name}</span>
                  {selectedState.code === s.code && (
                    <span className="ml-auto text-primary text-xs">Selected</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
