'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { syncSessionReplay } from '@/lib/posthog-browser';

/**
 * App Router navigations update `usePathname` in both directions (Link and
 * back/forward). `syncSessionReplay` also watches History so a sensitive
 * page is stopped at `pushState`, before the new screen paints.
 */
export function SessionReplayRoute() {
  const pathname = usePathname();

  useEffect(() => {
    syncSessionReplay(pathname);
  }, [pathname]);

  return null;
}
