import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Poppins } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { messagesForPath } from '@/i18n/config';
import { PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { cookieNoticeLocale } from '@/lib/cookie-notice-locale';
import { TRANSLATE_DOM_GUARD_SCRIPT } from '@/lib/translate-dom-guard';
import enMessages from '@/messages/en.json';
import esMessages from '@/messages/es.json';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { InternalTrafficFlag } from '@/components/analytics/InternalTrafficFlag';
import { TesterTrafficFlag } from '@/components/analytics/TesterTrafficFlag';
import { getGuestUser } from '@/lib/guest';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { AdMeasurementGate } from '@/components/analytics/AdMeasurementGate';
import { CookieConsentBar } from '@/components/analytics/CookieConsentBar';
import { AD_OPT_OUT_COOKIE } from '@/lib/ad-opt-out';
import { HtmlLang } from '@/components/i18n/HtmlLang';
import { ChunkReload } from '@/components/ChunkReload';
import { LI_FAT_ID_STRIP_SCRIPT } from '@/lib/strip-li-fat-id';
import { VITALS_BEACON_BOOTSTRAP } from '@/lib/vitals-beacon';
import { socialOpenGraph } from '@/lib/locale-seo';

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
    'registered agent',
    'incorporate online',
    'form an LLC',
    'LaunchForma',
  ],
  openGraph: socialOpenGraph({
    title: 'LaunchForma | Form a Florida LLC & Incorporate Your Business',
    description:
      'A private filing service that prepares and files your Florida LLC or Corporation with the state. Free registered agent and transparent all-in pricing. Not a government agency. No hidden fees, ever.',
    type: 'website',
    locale: 'en_US',
    siteName: 'LaunchForma',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'LaunchForma' }],
  }),
  twitter: {
    card: 'summary_large_image',
    title: 'LaunchForma | Form a Florida LLC & Incorporate Your Business',
    description:
      'Private Florida LLC formation service. All-in pricing, free registered agent, submission within 1 business day. Not a government agency.',
    images: ['/opengraph-image'],
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
  const requestLocale = await getLocale();
  const headerStore = headers();
  const pathname = headerStore.get('x-lf-pathname') ?? '';
  const locale = cookieNoticeLocale(headerStore.get(PUBLIC_PATH_HEADER) ?? '', requestLocale);
  const messages = locale === requestLocale ? await getMessages() : locale === 'es' ? esMessages : enMessages;
  const cookieCopy = (locale === 'es' ? esMessages : enMessages).cookieNotice;
  const session = await auth();
  const guest = session?.user?.isTester ? null : await getGuestUser();
  const testerUserId = session?.user?.isTester ? session.user.id : guest?.isTester ? guest.id : null;
  const isTester = session?.user?.isTester === true || guest?.isTester === true;
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
        <Script id="lf-translate-dom-guard" strategy="beforeInteractive">
          {TRANSLATE_DOM_GUARD_SCRIPT}
        </Script>
        <Script id="strip-li-fat-id" strategy="beforeInteractive">
          {LI_FAT_ID_STRIP_SCRIPT}
        </Script>
        <Script id="vitals-beacon" strategy="beforeInteractive">
          {VITALS_BEACON_BOOTSTRAP}
        </Script>
        {isTester ? (
          <Script id="lf-tester-flag" strategy="beforeInteractive">
            {`try{window.__lf_tester=1;document.cookie='lf_tester=1; Path=/; Max-Age=86400; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}catch(e){}`}
          </Script>
        ) : null}
        <PostHogProvider>
          <InternalTrafficFlag
            userId={session?.user?.id}
            email={session?.user?.email}
            role={session?.user?.role}
          />
          <TesterTrafficFlag isTester={isTester} userId={testerUserId} />
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
            <CookieConsentBar locale={locale} copy={cookieCopy} />
          </NextIntlClientProvider>
          <Analytics />
          <SpeedInsights />
          <Suspense fallback={null}>
            <AdMeasurementGate serverGpc={serverGpc} serverCookie={serverCookie} />
          </Suspense>
        </PostHogProvider>
      </body>
    </html>
  );
}
