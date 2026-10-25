'use client';

import { useEffect } from 'react';
import { markInternalTraffic } from '@/lib/analytics';
import {
  internalTrafficCookie,
  INTERNAL_TRAFFIC_FLAG,
  isInternalBrowserSignal,
  isInternalTrafficUser,
  internalTrafficQueryRequested,
} from '@/lib/internal-traffic';

/**
 * Registers is_internal for staff, partner mailboxes, automation browsers,
 * and anyone who opened ?lf_internal=1. Renders nothing.
 */
export function InternalTrafficFlag({
  userId,
  email,
  role,
}: {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
}) {
  useEffect(() => {
    if (internalTrafficQueryRequested(window.location.search)) {
      try {
        window.localStorage.setItem(INTERNAL_TRAFFIC_FLAG, '1');
      } catch {
        /* private mode */
      }
      document.cookie = internalTrafficCookie(window.location.protocol === 'https:');
    }
    let storedFlag: string | null = null;
    try {
      storedFlag = window.localStorage.getItem(INTERNAL_TRAFFIC_FLAG);
    } catch {
      storedFlag = null;
    }
    const internal =
      isInternalTrafficUser({ role, email }) ||
      isInternalBrowserSignal({
        userAgent: window.navigator.userAgent,
        search: window.location.search,
        cookie: document.cookie,
        storedFlag,
      });
    if (!internal) return;
    markInternalTraffic(userId, email);
  }, [userId, email, role]);
  return null;
}
