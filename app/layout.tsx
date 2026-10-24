import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Poppins } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { messagesForPath } from '@/i18n/config';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { isInternalTrafficUser } from '@/lib/internal-traffic';
import { InternalTrafficFlag } from '@/components/analytics/InternalTrafficFlag';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { LinkedInInsight } from '@/components/analytics/LinkedInInsight';
import { OpenAiPixel } from '@/components/analytics/OpenAiPixel';
import { openAiPixelBootstrap } from '@/lib/openai-pixel';
import { openAiPixelId } from '@/lib/tracking-ids';
import { HtmlLang } from '@/components/i18n/HtmlLang';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com',
  ),
  title: {
    default: 'LaunchForma | Form a Florida LLC & Incorporate Your Business',
    template: '%s · LaunchForma',
  },
  description:
    'LaunchForma is a private filing service that prepares and files your Florida LLC or Corporation with the state on your behalf. Free Year-1 Registered Agent, Operating Agreement options, and transparent all-in pricing. Not a government agency; no hidden fees.',
  keywords: [
    'LLC formation',
    'Corporation formation',
    'business formation',
    'Florida LLC',
    'Wyoming LLC',
    'Delaware LLC',
    'registered agent',
    'incorporate online',
    'form an LLC',
    'LaunchForma',
  ],
  openGraph: {
    title: 'LaunchForma | Form a Florida LLC & Incorporate Your Business',
    description:
      'A private filing service that prepares and files your Florida LLC or Corporation with the state. Free registered agent and transparent all-in pricing. Not a government agency. No hidden fees, ever.',
    type: 'website',
    locale: 'en_US',
    siteName: 'LaunchForma',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LaunchForma | Form a Florida LLC & Incorporate Your Business',
    description:
      'Private Florida LLC formation service. All-in pricing, free registered agent, submission within 1 business day. Not a government agency.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const session = await auth();
  const internalUser =
    session?.user?.id && isInternalTrafficUser(session.user) ? session.user : null;
  const pathname = headers().get('x-lf-pathname') ?? '';
  const openAiId = openAiPixelId();
  // Token URLs stay out of ad pixels. /es/... is rewritten before this header is set.
  const loadOpenAiPixel = Boolean(openAiId) && pathname !== '/reset-password';

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(poppins.variable, 'font-sans')}
        suppressHydrationWarning
      >
        <HtmlLang />
        {loadOpenAiPixel && openAiId ? (
          <Script id="openai-ads-pixel" strategy="beforeInteractive">
            {openAiPixelBootstrap(openAiId)}
          </Script>
        ) : null}
        <PostHogProvider>
          {internalUser ? (
            <InternalTrafficFlag userId={internalUser.id} email={internalUser.email} />
          ) : null}
          <NextIntlClientProvider locale={locale} messages={messagesForPath(pathname, messages)}>
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              toastOptions={{
                className: 'font-sans',
              }}
            />
          </NextIntlClientProvider>
          <Analytics />
          <SpeedInsights />
          <Suspense fallback={null}>
            <GoogleAnalytics />
            <LinkedInInsight />
            <OpenAiPixel />
          </Suspense>
        </PostHogProvider>
      </body>
    </html>
  );
}
