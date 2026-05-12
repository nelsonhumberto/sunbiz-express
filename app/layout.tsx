import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { JsonLd, organizationJsonLd } from '@/components/seo/JsonLd';

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
    default: 'LaunchForma — Incorporate. Empower. Elevate.',
    template: '%s · LaunchForma',
  },
  description:
    'LaunchForma simplifies business formation in Florida, Wyoming, and Delaware. File your LLC or Corporation online — same-business-day submission, free Year-1 Registered Agent, transparent pricing, zero hidden fees.',
  keywords: [
    'LLC formation',
    'Corporation formation',
    'business formation',
    'Florida LLC',
    'Wyoming LLC',
    'Delaware LLC',
    'registered agent',
    'EIN',
    'Sunbiz',
    'incorporate online',
    'form an LLC',
    'LaunchForma',
  ],
  openGraph: {
    title: 'LaunchForma — Incorporate. Empower. Elevate.',
    description:
      'File your LLC or Corporation in Florida, Wyoming, or Delaware. Same-day filing, free Year-1 Registered Agent, and transparent all-in pricing. No hidden fees, ever.',
    type: 'website',
    locale: 'en_US',
    siteName: 'LaunchForma',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LaunchForma — Incorporate. Empower. Elevate.',
    description:
      'File your LLC or Corporation online. All-in pricing, free registered agent, same-day filing.',
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <JsonLd data={organizationJsonLd()} />
      </head>
      <body
        className={cn(poppins.variable, 'font-sans')}
        suppressHydrationWarning
      >
        <PostHogProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
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
        </PostHogProvider>
      </body>
    </html>
  );
}
