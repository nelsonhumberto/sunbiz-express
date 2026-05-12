'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  ACTIVE_MARKETING_STATES,
  FLORIDA,
  resolveMarketingState,
  type MarketingState,
} from '@/lib/marketing-states';
import { PREFERRED_STATE_COOKIE } from '@/lib/constants';

/**
 * Resolve the marketing state currently in effect on the client.
 *
 * Resolution order matches the rest of the app:
 *   1. `?state=` query parameter (highest priority — campaign links).
 *   2. URL path: `/states/<slug>` extracts the slug.
 *   3. `preferred_state` cookie set by the StateSwitcher.
 *   4. Default Florida.
 *
 * Only `active` states resolve to non-default values; coming-soon states still
 * resolve via the path (so a switch on a coming-soon page still highlights it
 * correctly), but the cookie path only ever stores active state codes.
 */
export function useCurrentMarketingState(): MarketingState {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  return useMemo(() => {
    const queryState = searchParams?.get('state');
    if (queryState) return resolveMarketingState(queryState);

    if (pathname.startsWith('/states/')) {
      const slug = pathname.split('/')[2] ?? '';
      const fromSlug = resolveMarketingState(slug);
      if (fromSlug.slug === slug.toLowerCase()) return fromSlug;
    }

    if (typeof document !== 'undefined') {
      const cookieMatch = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${PREFERRED_STATE_COOKIE}=`));
      if (cookieMatch) {
        const code = decodeURIComponent(cookieMatch.split('=')[1] ?? '');
        const found = ACTIVE_MARKETING_STATES.find((s) => s.code === code.toUpperCase());
        if (found) return found;
      }
    }

    return FLORIDA;
  }, [pathname, searchParams]);
}
