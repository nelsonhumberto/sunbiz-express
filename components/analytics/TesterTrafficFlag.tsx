'use client';

import { useEffect } from 'react';
import { markTesterTraffic } from '@/lib/analytics';

/** Stamps is_test and is_internal once this browser is known to be a tester. */
export function TesterTrafficFlag({
  isTester,
  userId,
}: {
  isTester?: boolean;
  userId?: string | null;
}) {
  useEffect(() => {
    if (!isTester) return;
    markTesterTraffic(userId);
  }, [isTester, userId]);
  return null;
}
