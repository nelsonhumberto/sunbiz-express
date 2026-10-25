import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalEntityIntro } from '@/components/legal/LegalEntityIntro';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { withLocaleMeta } from '@/lib/locale-seo';

const PRIVACY_MARKDOWN_EN = `## 1. What we collect

To form your business, we collect information you provide: name, email, phone, business name, addresses, member/officer details, signatures, and payment information. If you sign up for our newsletter, checklist, or sample operating agreement, we collect your email address. If you use our in-app assistant, we collect the questions you ask it.

We also collect usage data automatically when you visit our site: IP address, device and browser type, pages viewed, the ad or campaign that brought you here (such as UTM tags or a Google click ID), and actions you take, such as starting a filing or completing a purchase. On some public pages we may also record how you move through the page (session replay, described in Section 7).

## 2. Why we collect it

We use this data to: (a) form your business with the Florida Department of State, (b) deliver the services you purchased, (c) maintain compliance reminders, (d) improve the platform, and (e) measure how well our advertising works, for example whether someone who clicked one of our ads later made a purchase.

## 3. We do not sell your data

LaunchForma does **not** sell, lease, or rent your personal information, and we do not share it with data brokers. We do use advertising and analytics tools from Google, OpenAI, and PostHog (listed in Section 4). These tools receive limited information about your visit, such as pages viewed, your IP address, device data, and whether you made a purchase or signed up, so we can measure our ads and improve the site. We do not give them the details of your business filing, such as your SSN or tax ID, member details, or signatures.

## 4. Who we share with

We share information with the services that help us run LaunchForma:

- **Florida Department of State (Sunbiz)**: to file your formation documents. Filings are public records.
- **Stripe**: to process payments (PCI-DSS Level 1 certified). We also send Stripe basic campaign information (such as UTM tags) with your payment so we know which ad led to it.
- **Google (Gmail / Google Workspace), our email delivery provider**: to send transactional emails and, if you sign up, our newsletter and checklist emails.
- **Vercel**: to host our website and app, and for basic site performance and visitor analytics.
- **Supabase**: to host our database.
- **PostHog**: for product analytics (pageviews and events) and session replay. Data is processed in the United States.
- **Google (Google Analytics and Google Ads)**: to measure site traffic and our Google Ads campaigns, including purchase and signup conversions.
- **OpenAI**: through the OpenAI ads measurement pixel, to measure our ads shown in ChatGPT, including signups.
- **DeepSeek**: to power our in-app assistant. We remove SSNs and tax IDs before anything is sent.
- **Telnyx**: to send and receive faxes related to your filings.
- **sunbizdaily.com**: a third-party business-name search service. When you check whether a name is available, we send it the business name you are searching.

## 5. How we secure data

Your data is encrypted in transit (HTTPS) and encrypted at rest by our hosting and database providers (Vercel and Supabase). Access to customer data is limited to authorized staff. Passwords are hashed with bcrypt, so we never see your plaintext password.

## 6. Your rights (GDPR + CCPA)

- **Access:** request a copy of your data at any time
- **Correction:** update inaccurate information
- **Deletion:** request account deletion (subject to 7-year FL retention)
- **Opt-out of marketing email:** use the unsubscribe link in any newsletter or checklist email. Transactional emails are required for service delivery.
- **Opt-out of ad measurement and analytics:** you can block or clear cookies in your browser settings, use an ad or tracker blocker, and manage Google ad personalization at [adssettings.google.com](https://adssettings.google.com).

To make any request, use our [contact page](/contact) or email privacy@launchforma.com.

### Do Not Sell or Share My Personal Information

Some states (such as California) may treat sharing visit data with ad tools for cross-context behavioral advertising as "sharing." You can opt out with the [Do Not Sell or Share My Personal Information](/privacy-choices) link in the footer. We honor Global Privacy Control (GPC) browser signals as an opt-out. When you are opted out, we do not load the Google Analytics and Google Ads tags or the OpenAI ads pixel in that browser, and we store the choice in a cookie. Essential cookies and our own product analytics (PostHog and Vercel) still run.

## 7. Cookies and similar technologies

We use cookies and similar technologies (such as local storage) for:

- **Essential:** keeping you signed in (auth session cookie) and saving your in-progress filing if you start without an account (a guest cookie that lasts up to 30 days).
- **Campaign tracking:** remembering which ad or campaign brought you to the site (a first-party cookie that lasts up to 30 days).
- **Ad measurement choice:** a first-party cookie (\`lf_ad_optout\`) that lasts up to 1 year. It stores whether you opted out of Google and OpenAI ad measurement in this browser. We set it when you use the footer link or when your browser sends Global Privacy Control.
- **Analytics and advertising:** Google Analytics, Google Ads, the OpenAI ads pixel, PostHog, and Vercel may set their own cookies or identifiers to measure visits and ad conversions.

**Session replay.** On our production site, PostHog may record how you interact with public pages (clicks, scrolling, page changes) so we can find and fix problems. All text and form inputs are masked, and images and media are blocked, so we do not see what you type or upload. Session replay is turned off on your dashboard, the filing wizard, checkout, sign-in and account pages, and our admin pages.

We do not currently respond to Do Not Track signals, but we do honor Global Privacy Control (see Section 6).

## 8. Data retention

Florida law requires us to retain business formation records for 7 years. After that period, we delete or anonymize records on request.

## 9. Contact

Privacy questions? Email [privacy@launchforma.com](mailto:privacy@launchforma.com) or use our [contact page](/contact).
`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('legalPrivacy');
    return withLocaleMeta('/privacy', { title: t('metaTitle'), description: t('metaDescription') }, locale);
  }
  return withLocaleMeta(
    '/privacy',
    {
      title: 'Privacy Policy',
      description:
        'LaunchForma Privacy Policy: what we collect, why, who we share it with, how we use analytics and ad measurement, and how to exercise your GDPR / CCPA rights.',
    },
    locale,
  );
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('legalPrivacy');
    return (
      <>
        <p className="text-xs uppercase tracking-wider text-ink-subtle">{t('effective')}</p>
        <h1>{t('title')}</h1>
        <LegalEntityIntro />
        <MarkdownBody markdown={t('body')} locale="es" />
      </>
    );
  }
  return (
    <>
      <p className="text-xs uppercase tracking-wider text-ink-subtle">Effective October 25, 2026</p>
      <h1>Privacy Policy</h1>
      <LegalEntityIntro />
      <MarkdownBody markdown={PRIVACY_MARKDOWN_EN} locale="en" />
    </>
  );
}
