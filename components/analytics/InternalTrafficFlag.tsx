'use client';

import { useEffect } from 'react';
import { markInternalTraffic } from '@/lib/analytics';

/**
 * Flags a logged-in admin or @launchforma.com account so PostHog can filter
 * internal traffic. Renders nothing.
 */
export function InternalTrafficFlag({
  userId,
  email,
}: {
  userId: string;
  email?: string | null;
}) {
  useEffect(() => {
    markInternalTraffic(userId, email);
  }, [userId, email]);
  return null;
}
