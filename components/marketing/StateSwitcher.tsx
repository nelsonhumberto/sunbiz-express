'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Check, MapPin } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setPreferredStateAction } from '@/actions/preferred-state';
import {
  ACTIVE_MARKETING_STATES,
  localizedStateName,
  type MarketingState,
} from '@/lib/marketing-states';
import { cn } from '@/lib/utils';

interface StateSwitcherProps {
  /** State currently rendered on the page (resolved upstream). */
  currentState: MarketingState;
  variant?: 'icon' | 'full';
  className?: string;
}

/**
 * Compact dropdown that lets a marketing visitor pick which state landing
 * to view. Persists the choice in a `preferred_state` cookie so middleware
 * stops auto-redirecting on subsequent visits.
 *
 * Behavior:
 *   - Clicking a state writes the cookie via {@link setPreferredStateAction}
 *     and routes to "/" (Florida) or "/states/<slug>" (others).
 *   - The current state shows a check mark.
 */
export function StateSwitcher({
  currentState,
  variant = 'icon',
  className,
}: StateSwitcherProps) {
  const router = useRouter();
  const locale = useLocale();
  const [pending, start] = useTransition();

  const switchTo = (state: MarketingState) => {
    if (state.code === currentState.code) return;
    start(async () => {
      await setPreferredStateAction(state.code);
      const target = state.code === 'FL' ? '/' : `/states/${state.slug}`;
      router.push(target);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change formation state"
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink transition-colors disabled:opacity-60',
            variant === 'full' && 'px-3',
            className,
          )}
        >
          <MapPin className="h-4 w-4" />
          {variant === 'full' ? (
            <span>{localizedStateName(currentState, locale)}</span>
          ) : (
            <span className="text-xs uppercase tracking-wider">
              {currentState.code}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {ACTIVE_MARKETING_STATES.map((state) => (
          <DropdownMenuItem
            key={state.code}
            onClick={() => switchTo(state)}
            className="cursor-pointer"
          >
            <span className="mr-2 text-xs font-mono text-ink-subtle w-6">
              {state.code}
            </span>
            <span className="flex-1">{localizedStateName(state, locale)}</span>
            {state.code === currentState.code && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
