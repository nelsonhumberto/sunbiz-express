const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// ─── Security headers ─────────────────────────────────────────────────────
// Baseline OWASP-aligned response headers applied to every route. Marketing
// + checkout pages need to allow our analytics, payments, and CMS image
// providers but must lock down everything else.
//
// The CSP intentionally allows `'unsafe-inline'` for styles (Tailwind's JIT
// + Radix UI both inject runtime styles) and `'unsafe-eval'` is NOT
// granted. Scripts use a nonce-less allowlist because Next.js inlines
// hydration data — adopting nonces would require migrating to the edge
// middleware-based nonce model which is tracked separately.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://js.stripe.com",
  "object-src 'none'",
  "img-src 'self' data: blob: https://*.stripe.com https://images.unsplash.com https://avatars.githubusercontent.com https://*.posthog.com https://*.i.posthog.com https://*.vercel.app https://*.vercel-insights.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://*.i.posthog.com https://va.vercel-scripts.com https://vercel.live",
  "connect-src 'self' https://*.stripe.com https://api.stripe.com https://*.posthog.com https://*.i.posthog.com https://vitals.vercel-insights.com https://*.vercel-insights.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com"), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Ensure the IRS Form 2553 template ships with the admin route's serverless
  // bundle (it's read from disk at runtime via fs).
  outputFileTracingIncludes: {
    '/api/admin/filings/[id]/form-2553': ['./data/forms/**'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        // Apply security headers to every route. API routes inherit the
        // same CSP so admin/JSON responses are also protected from
        // framing or arbitrary external script execution.
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async redirects() {
    // Legacy URLs that surfaced in the May 2026 SEO audit as 404s. Each
    // 301s to its modern canonical so we preserve any link equity that
    // remains and stop wasting crawl budget on dead URLs.
    return [
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/why-us', destination: '/about#why', permanent: true },
      { source: '/annual-report-help', destination: '/file-annual-report', permanent: true },
      {
        source: '/florida-llc-guide',
        destination: '/guides/florida-llc-operating-agreement',
        permanent: true,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
