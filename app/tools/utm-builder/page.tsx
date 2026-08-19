import type { Metadata } from 'next';
import { UtmBuilder } from './builder';

// Internal marketing tool. Unlisted (not linked from anywhere) and noindex so
// it never appears in search or the sitemap. Share the bare URL with the
// marketing team: https://launchforma.com/tools/utm-builder
export const metadata: Metadata = {
  title: 'UTM Link Builder - Internal',
  robots: { index: false, follow: false },
};

export default function UtmBuilderPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-surface focus:outline-none">
      <UtmBuilder />
    </main>
  );
}
