import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'LaunchForma — Incorporate. Empower. Elevate.',
    template: '%s · LaunchForma',
  },
  description:
    'LaunchForma simplifies Florida business formation. File your LLC or Corporation online — same-business-day submission, free Year-1 Registered Agent, transparent pricing, zero hidden fees.',
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
    title: 'LaunchForma — Incorporate. Empower. Elevate.',
    description:
      'Simplifying Florida business formation. Same-day filing, free Year-1 Registered Agent, and transparent all-in pricing. No hidden fees, ever.',
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
        className={cn(poppins.variable, 'font-sans')}
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
