import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Poppins } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { messagesForPath } from '@/i18n/config';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { InternalTrafficFlag } from '@/components/analytics/InternalTrafficFlag';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { AdMeasurementGate } from '@/components/analytics/AdMeasurementGate';
import { LinkedInInsight } from '@/components/analytics/LinkedInInsight';
import { AD_OPT_OUT_COOKIE } from '@/lib/ad-opt-out';
import { HtmlLang } from '@/components/i18n/HtmlLang';
import { ChunkReload } from '@/components/ChunkReload';

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
  const headerStore = headers();
  const pathname = headerStore.get('x-lf-pathname') ?? '';
  const serverGpc = headerStore.get('sec-gpc') === '1';
  const serverCookie = cookies().get(AD_OPT_OUT_COOKIE)?.value ?? null;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(poppins.variable, 'font-sans')}
        suppressHydrationWarning
      >
        <HtmlLang />
        <ChunkReload />
        <PostHogProvider>
          <InternalTrafficFlag
            userId={session?.user?.id}
            email={session?.user?.email}
            role={session?.user?.role}
          />
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
            <AdMeasurementGate serverGpc={serverGpc} serverCookie={serverCookie} />
            <LinkedInInsight />
          </Suspense>
        </PostHogProvider>
      </body>
    </html>
  );
}
