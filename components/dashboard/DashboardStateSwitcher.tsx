'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MapPin } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setPreferredStateAction } from '@/actions/preferred-state';
import { cn } from '@/lib/utils';

const STATES = [
  { code: 'FL', name: 'Florida' },
  { code: 'DE', name: 'Delaware' },
  { code: 'WY', name: 'Wyoming' },
] as const;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : undefined;
}

export function DashboardStateSwitcher() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = readCookie('preferred_state')?.toUpperCase() || 'FL';
  const currentState = STATES.find((s) => s.code === current) ?? STATES[0];

  const switchTo = (code: string) => {
    if (code === currentState.code) return;
    start(async () => {
      await setPreferredStateAction(code);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            'w-full inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium',
            'text-ink-muted hover:bg-muted hover:text-ink transition-colors disabled:opacity-60',
          )}
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{currentState.name}</span>
          <span className="text-xs text-ink-subtle">{currentState.code}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          Formation state
        </div>
        {STATES.map((s) => (
          <DropdownMenuItem
            key={s.code}
            onClick={() => switchTo(s.code)}
            className="cursor-pointer"
          >
            <span className="mr-2 text-xs font-mono text-ink-subtle w-6">
              {s.code}
            </span>
            <span className="flex-1">{s.name}</span>
            {s.code === currentState.code && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
