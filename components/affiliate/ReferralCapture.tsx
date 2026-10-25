'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { AFFILIATE_STORAGE_KEY, normalizeAffiliateCode } from '@/lib/affiliate';

/**
 * Mirrors ?ref= into localStorage. The middleware owns the lf_ref cookie.
 * Ad opt-out keeps the cookie and does not use localStorage.
 * A disabled flag clears any stored click and writes nothing.
 */
export function ReferralCapture({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled) {
      try {
        window.localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      } catch {
        /* private mode */
      }
      return;
    }

    let optedOut = false;
    try {
      optedOut = isClientAdMeasurementOptedOut();
    } catch {
      optedOut = false;
    }
    if (optedOut) {
      try {
        window.localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      } catch {
        /* private mode */
      }
      return;
    }

    const ref = searchParams.get('ref');
    if (!ref) return;
    const code = normalizeAffiliateCode(ref);
    if (!code) return;
    try {
      window.localStorage.setItem(
        AFFILIATE_STORAGE_KEY,
        JSON.stringify({ code, at: Date.now() }),
      );
    } catch {
      /* private mode */
    }
  }, [enabled, pathname, searchParams]);

  return null;
}
