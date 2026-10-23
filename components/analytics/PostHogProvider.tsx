'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import '@/lib/posthog-browser';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
