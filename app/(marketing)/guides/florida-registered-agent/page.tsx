import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { withBrand } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';

const PUBLISHED = '2026-10-23';
const TITLE = 'What Is a Registered Agent in Florida?';
const DESCRIPTION =
  'Florida registered agent requirements in plain English: who can serve, the address rules, and how to change your agent.';

const FAQ = [
  {
    q: 'What is a registered agent in Florida?',
    a: 'A registered agent is the person or business that accepts service of process and official notices on behalf of your LLC or corporation.',
  },
  {
    q: 'Who can serve as a Florida registered agent?',
    a: 'The agent must have a physical street address in Florida. P.O. Boxes are not accepted. The agent must sign to accept the role. An individual, or a business entity with an active Florida filing or registration, can serve. An entity cannot serve as its own registered agent. An individual associated with the business can. If a business entity is the agent, an individual principal of that entity signs.',
  },
  {
    q: 'What does Florida charge to designate or change a registered agent?',
    a: 'The state charges a registered agent designation fee when you form a Florida LLC ($25.00) or corporation ($35.00). Changing your agent later costs $25.00 for an LLC and $35.00 for a corporation, per the state fee schedule. Commercial agent services charge their own annual fees.',
  },
];

const PATH = '/guides/florida-registered-agent';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlRa');
    return withLocaleMeta(
      PATH,
      {
        title: t('metaTitle'),
        description: t('metaDescription'),
        openGraph: {
          title: t('ogTitle'),
          description: t('ogDescription'),
          type: 'article',
          publishedTime: PUBLISHED,
        },
      },
      locale,
    );
  }
  return withLocaleMeta(
    PATH,
    {
      title: TITLE,
      description: DESCRIPTION,
      openGraph: {
        title: withBrand(TITLE),
        description: DESCRIPTION,
        type: 'article',
        publishedTime: PUBLISHED,
      },
    },
    locale,
  );
}

export default async function FloridaRegisteredAgentGuide() {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlRa');
    const faq = [1, 2, 3].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
    return (
      <>
        <JsonLd data={faqPageJsonLd(faq)} />
        <GuideLayout
          slug="florida-registered-agent"
          title={t('title')}
          description={t('description')}
          datePublished={PUBLISHED}
          readingMinutes={5}
          cta={{
            headline: t('ctaHeadline'),
            subhead: t('ctaSubhead'),
            href: '/pricing',
            label: t('ctaLabel'),
          }}
        >
          <MarkdownBody markdown={t('body')} locale="es" />
          <p className="not-prose text-xs text-ink-subtle mt-8">{t('disclaimer')}</p>
        </GuideLayout>
      </>
    );
  }
  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ)} />
      <GuideLayout
        slug="florida-registered-agent"
        title={TITLE}
        description="A registered agent is the person or business that accepts service of process and official notices on behalf of your LLC or corporation. This is general information, not legal advice."
        datePublished={PUBLISHED}
        readingMinutes={5}
        cta={{
          headline: 'Year-1 registered agent is included',
          subhead:
            'LaunchForma includes Year-1 registered agent service in every formation package.',
          href: '/pricing',
          label: 'See pricing',
        }}
      >
        <h2>Florida requirements</h2>
        <p>Based on the Division of Corporations filing instructions:</p>
        <ul>
          <li>The agent must have a physical street address in Florida. P.O. Boxes are not accepted.</li>
          <li>The agent must sign to accept the obligations of the role.</li>
          <li>An individual, or a business entity with an active Florida filing or registration, can serve.</li>
          <li>
            An entity cannot serve as its own registered agent. An individual associated with the
            business can.
          </li>
          <li>If a business entity is the agent, an individual principal of that entity signs.</li>
        </ul>
        <p>
          Forming the LLC itself is covered in{' '}
          <a href="/guides/how-to-form-an-llc-in-florida">how to form an LLC in Florida</a>.
        </p>

        <h2>Being your own agent vs using a service</h2>
        <p>Serving as your own agent is allowed if you meet the requirements. Things people weigh:</p>
        <ul>
          <li>The agent&apos;s address appears on the public record</li>
          <li>Someone needs to be available at that address to receive documents</li>
          <li>A service can forward documents and send reminders</li>
        </ul>

        <h2>Fees</h2>
        <p>
          The state charges a registered agent designation fee when you form a Florida LLC
          ($25.00) or corporation ($35.00). Changing your agent later costs $25.00 for an LLC
          and $35.00 for a corporation, per the state fee schedule. Commercial agent services
          charge their own annual fees.
        </p>
        <p>
          LaunchForma includes Year-1 registered agent service in every formation package.{' '}
          <Link href="/pricing">See pricing</Link> or <Link href="/start">start a filing</Link>.
        </p>

        <h2>Questions</h2>
        {FAQ.map((item) => (
          <div key={item.q}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}

        <h2>Sources</h2>
        <ul>
          <li>
            Florida Division of Corporations, Instructions for Articles of Organization:{' '}
            <a
              href="https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/"
              target="_blank"
              rel="noopener noreferrer"
            >
              dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/
            </a>
          </li>
          <li>
            Florida Division of Corporations, Fees:{' '}
            <a
              href="https://dos.fl.gov/sunbiz/forms/fees/"
              target="_blank"
              rel="noopener noreferrer"
            >
              dos.fl.gov/sunbiz/forms/fees/
            </a>
          </li>
        </ul>

        <p className="not-prose text-xs text-ink-subtle mt-8">
          LaunchForma is not a law firm and this guide is not legal advice.
        </p>
      </GuideLayout>
    </>
  );
}
