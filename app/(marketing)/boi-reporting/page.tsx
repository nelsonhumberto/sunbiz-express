import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Globe2, ArchiveX, ArrowRight, FileText } from 'lucide-react';
import { CTABanner } from '@/components/marketing/CTABanner';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'BOI Reporting Update 2026 - U.S. Companies Are Exempt',
  description:
    "FinCEN's August 2026 final rule permanently exempts companies formed in the United States from beneficial ownership information (BOI) reporting. Here is what changed and who still reports.",
  alternates: { canonical: '/boi-reporting' },
  openGraph: {
    title: 'BOI Reporting Update 2026 - U.S. Companies Are Exempt',
    description:
      'Companies formed in the United States no longer file beneficial ownership (BOI) reports with FinCEN.',
    type: 'website',
  },
};

const BOI_FAQ = [
  {
    q: 'Do I need to file a BOI report for my new LLC or Corporation?',
    a: "No. FinCEN's final rule (August 2026) exempts companies formed in the United States from beneficial ownership information (BOI) reporting. A new Florida, Wyoming, or Delaware LLC or Corporation has nothing to file with FinCEN.",
  },
  {
    q: 'Who still has to report?',
    a: 'Only foreign companies registered to do business in a U.S. state. They report their non-U.S. beneficial owners; U.S. persons are not reported.',
  },
  {
    q: 'I already filed a BOI report. Do I need to update it?',
    a: 'No. U.S. companies and U.S. persons do not need to update or correct reports they filed before the rule changed. FinCEN has said it will delete information previously reported by U.S. persons.',
  },
  {
    q: 'Does LaunchForma file BOI reports?',
    a: 'No. Because companies formed in the United States no longer have to report, there is nothing for us to file for you.',
  },
  {
    q: 'Where can I read the rule?',
    a: "On FinCEN's website at fincen.gov/boi, which has the final rule and FinCEN's updated FAQs.",
  },
];

export default function BoiReportingPage() {
  return (
    <>
      <JsonLd data={faqPageJsonLd(BOI_FAQ)} />

      <section className="pt-16 pb-10">
        <div className="container max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/5 border border-primary/15 px-3 py-1 rounded-full">
            <ShieldCheck className="h-3.5 w-3.5" />
            BOI update - August 2026
          </span>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-medium tracking-tight">
            No BOI report needed for{' '}
            <span className="italic text-primary">U.S. companies.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            FinCEN&apos;s final rule permanently removed the beneficial ownership reporting
            requirement for companies formed in the United States. If you form a Florida, Wyoming,
            or Delaware LLC or Corporation, there is nothing to file with FinCEN.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/start"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-md font-semibold hover:bg-primary-hover transition-colors"
            >
              Start your filing
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#faq"
              className="inline-flex items-center justify-center gap-2 border border-border bg-white text-ink px-6 py-3 rounded-md font-semibold hover:bg-muted transition-colors"
            >
              Read the details
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 bg-white border-y border-border">
        <div className="container max-w-5xl">
          <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-center mb-10">
            What changed
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: 'U.S. companies are exempt',
                body: 'Corporations, LLCs, and other entities created by filing with a U.S. state are no longer reporting companies. They file no initial, updated, or corrected BOI reports.',
              },
              {
                icon: <Globe2 className="h-5 w-5" />,
                title: 'Who still reports',
                body: 'Only foreign companies registered to do business in the U.S., and they report only their non-U.S. beneficial owners.',
              },
              {
                icon: <ArchiveX className="h-5 w-5" />,
                title: 'Already filed?',
                body: 'No updates are needed. FinCEN has said it will delete information previously reported by U.S. persons.',
              },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-border bg-white p-6">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  {card.icon}
                </div>
                <h3 className="font-semibold text-lg leading-tight">{card.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-16">
        <div className="container max-w-3xl">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Frequently asked
            </span>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-medium tracking-tight">
              BOI in 2026 - answered.
            </h2>
          </div>
          <div className="space-y-4">
            {BOI_FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-white p-5">
                <p className="font-semibold text-ink">{item.q}</p>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="container max-w-3xl">
          <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
            <FileText className="h-4 w-4 text-ink-subtle shrink-0 mt-0.5" />
            <p className="text-xs text-ink-subtle leading-relaxed">
              LaunchForma is not a law firm and this page is not legal advice. Confirm current
              rules at{' '}
              <a href="https://www.fincen.gov/boi" target="_blank" rel="noopener noreferrer" className="underline">
                fincen.gov/boi
              </a>{' '}
              before relying on any guidance.
            </p>
          </div>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
