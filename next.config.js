const createNextIntlPlugin = require('next-intl/plugin');
const { RETIRED_STATE_REDIRECTS } = require('./lib/retired-state-redirects.cjs');

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
//
// A console may report an eval violation from `_next/static/chunks/7770-*.js`
// on home, pricing, and checkout. That filename is a webpack chunk id, so it
// changes every build. In a production `next build` the shared chunk on those
// three routes is posthog-js (session replay included). The shipped bundle
// and posthog-js's recorder files do not call eval or new Function. The word
// "eval" only appears in stack-trace parsing. Dev compiles the same chunk
// with eval source maps, which the browser reports and which are not in the
// production output. Page render, checkout, and navigation do not need
// 'unsafe-eval'. Do not add it.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://js.stripe.com",
  "object-src 'none'",
  // Ads conversion pixels (Google Ads) plus PostHog
  // (us.i.posthog.com, us-assets.i.posthog.com) and the OpenAI ads pixel
  // (bzr.openai.com, bzrcdn.openai.com). googleads.g.doubleclick.net is listed
  // explicitly next to *.doubleclick.net so the conversion hosts stay allowed.
  // Google's Ads CSP also sends conversion pixels to pagead2 (img) and
  // googletagmanager (frame). https://developers.google.com/tag-platform/security/guides/csp
  "img-src 'self' data: blob: https://*.stripe.com https://images.unsplash.com https://avatars.githubusercontent.com https://*.posthog.com https://*.i.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://*.vercel.app https://*.vercel-insights.com https://www.google-analytics.com https://www.googletagmanager.com https://ad.doubleclick.net https://*.doubleclick.net https://googleads.g.doubleclick.net https://www.google.com https://www.googleadservices.com https://pagead2.googlesyndication.com https://bzr.openai.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://*.i.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://va.vercel-scripts.com https://vercel.live https://www.googletagmanager.com https://www.google-analytics.com https://ad.doubleclick.net https://*.doubleclick.net https://googleads.g.doubleclick.net https://www.google.com https://www.googleadservices.com https://bzrcdn.openai.com",
  "connect-src 'self' https://*.stripe.com https://api.stripe.com https://*.posthog.com https://*.i.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://vitals.vercel-insights.com https://*.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://ad.doubleclick.net https://*.doubleclick.net https://googleads.g.doubleclick.net https://www.google.com https://www.googleadservices.com https://pagead2.googlesyndication.com https://bzr.openai.com https://bzrcdn.openai.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.googletagmanager.com https://ad.doubleclick.net https://*.doubleclick.net https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.google.com",
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
      {
        // Operating agreement samples. noindex so a leaked URL is not indexed.
        source: '/oa/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
  async redirects() {
    // Legacy URLs that surfaced in the May 2026 SEO audit as 404s. Each
    // 301s to its modern canonical so we preserve any link equity that
    // remains and stop wasting crawl budget on dead URLs.
    return [
      // Delaware and Wyoming marketing URLs. LaunchForma sells Florida.
      // statusCode 308 (permanent: true is also 308, but keep it explicit).
      ...RETIRED_STATE_REDIRECTS,
      { source: '/wizard', destination: '/start', permanent: true },
      // Old login URLs. The app route is /sign-in; /es/sign-in is the Spanish
      // rewrite of that same page.
      { source: '/login', destination: '/sign-in', permanent: true },
      { source: '/es/login', destination: '/es/sign-in', permanent: true },
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/why-us', destination: '/about#why', permanent: true },
      { source: '/annual-report-help', destination: '/file-annual-report', permanent: true },
      { source: '/reinstate-florida-llc', destination: '/reinstate-llc', permanent: true },
      { source: '/es/reinstate-florida-llc', destination: '/es/reinstate-llc', permanent: true },
      {
        source: '/florida-llc-guide',
        destination: '/guides/florida-llc-operating-agreement',
        permanent: true,
      },
      // /blog has no pages. 301 (not next's permanent:true, which is 308).
      { source: '/blog', destination: '/guides', statusCode: 301 },
      { source: '/blog/:path*', destination: '/guides', statusCode: 301 },
      // www → apex. Live traffic currently 307s at Vercel's domain layer
      // (see the PR). statusCode 301 is a real permanent redirect; `permanent:
      // true` would emit 308. If the dashboard domain redirect still answers
      // first, change that domain setting to a permanent redirect.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.launchforma.com' }],
        destination: 'https://launchforma.com/:path*',
        statusCode: 301,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
