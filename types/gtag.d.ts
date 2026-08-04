// Global typing for the Google Analytics / Ads gtag.js bridge.
export {};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}
