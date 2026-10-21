// Global typing for the Google Analytics / Ads gtag.js bridge.
export {};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    lintrk?: ((action: string, payload?: Record<string, unknown>) => void) & { q?: unknown[] };
    oaiq?: (...args: unknown[]) => void;
    _linkedin_partner_id?: string;
    _linkedin_data_partner_ids?: string[];
  }
}
