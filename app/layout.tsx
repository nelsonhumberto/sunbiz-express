import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

export const metadata: Metadata = {
  title: {
    default: 'Sunbiz Express — Form your Florida LLC in minutes',
    template: '%s · Sunbiz Express',
  },
  description:
    'The transparent, modern way to form a Florida LLC or Corporation. Free Year-1 Registered Agent, no hidden fees, automatic compliance reminders. Filed in 1 business day.',
  keywords: [
    'Florida LLC',
    'Florida Corporation',
    'business formation',
    'registered agent',
    'EIN',
    'Sunbiz',
    'incorporate Florida',
  ],
  openGraph: {
    title: 'Sunbiz Express — Form your Florida business in minutes',
    description:
      'The transparent, modern alternative to LegalZoom. Free Registered Agent for one year. Filed in 1 business day.',
    type: 'website',
    locale: 'en_US',
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
      <body
        className={cn(inter.variable, fraunces.variable, 'font-sans')}
        suppressHydrationWarning
      >
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
      </body>
    </html>
  );
}
