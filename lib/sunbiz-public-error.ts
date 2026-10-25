import { SunbizError } from '@/lib/sunbiz';

export const CUSTOMER_SUNBIZ_LOOKUP_ERROR = 'Could not load that record. Please try again.';

const INTERNAL_SUNBIZ_DETAIL = /SUNBIZDAILY_API_KEY|LINK_ENTITY_ALLOW_SEED_LOOKUP|SUNBIZ_SCRAPER_PROXY|SUNBIZ_LOCAL_PROXY/;

/** Customer-facing lookup text. Callers log the original error before using this. */
export function customerSunbizMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (INTERNAL_SUNBIZ_DETAIL.test(message)) return CUSTOMER_SUNBIZ_LOOKUP_ERROR;
  if (
    err instanceof SunbizError &&
    (err.code === 'not_found' || err.code === 'parse' || err.code === 'timeout' || err.code === 'rate_limit')
  ) {
    return message;
  }
  return CUSTOMER_SUNBIZ_LOOKUP_ERROR;
}
