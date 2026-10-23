import type { Metadata } from 'next';
import type { MarketingState } from '@/lib/marketing-states';

/** noindex for coming-soon state landings (templated waitlist pages). */
export const COMING_SOON_ROBOTS: Metadata['robots'] = {
  index: false,
  follow: true,
  googleBot: { index: false, follow: true },
};

export function robotsForMarketingState(state: MarketingState): Metadata['robots'] | undefined {
  if (state.availability === 'coming_soon') return COMING_SOON_ROBOTS;
  return undefined;
}
