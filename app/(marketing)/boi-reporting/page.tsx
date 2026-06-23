import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ShieldAlert,
  Clock,
  Lock,
  CheckCircle2,
  ArrowRight,
  FileText,
  Receipt,
} from 'lucide-react';
import { CTABanner } from '@/components/marketing/CTABanner';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'BOI Filing 2026 — FinCEN Beneficial Ownership Reporting',
  description:
    "Most LLCs and Corporations must file a Beneficial Ownership Information (BOI) report with FinCEN. LaunchForma's $49 managed BOI filing handles preparation, review, and submission — encrypted in transit and at rest.",
  alternates: { canonical: '/boi-reporting' },
  openGraph: {
    title: 'BOI Filing for LLCs and Corporations — $49 Managed',
    description:
      'Stay compliant with the Corporate Transparency Act. LaunchForma prepares and submits your FinCEN BOI report for $49 — encrypted, auditable, and on time.',
    type: 'website',
  },
};

const BOI_FAQ = [
  {
    q: 'What is a BOI report?',
    a: 'A Beneficial Ownership Information (BOI) report identifies the individuals who ultimately own or control a U.S. business entity. FinCEN — a bureau of the U.S. Treasury — collects these reports under the Corporate Transparency Act (CTA) to combat money laundering, tax evasion, and other illicit finance.',
  },
  {
    q: 'Who has to file?',
    a: 'Most domestic LLCs, Corporations, and similar entities formed in the U.S. (and many foreign entities registered to do business in the U.S.) must file. There are 23 statutory exemptions — including large operating companies (>$5M revenue + >20 employees + physical U.S. office), publicly traded companies, banks, registered investment advisers, and certain regulated entities. We screen for exemptions before filing.',
  },
  {
    q: 'When is the deadline?',
    a: 'Entities created or registered on or after January 1, 2025 must file within 30 days of formation. Entities created in 2024 had until January 13, 2025. Entities created before January 1, 2024 originally had until January 1, 2025. Any change to beneficial-ownership information (new owner, address change for a beneficial owner) must be reported within 30 days. Enforcement status has shifted multiple times — we keep our process current with the latest FinCEN guidance.',
  },
  {
    q: 'What information has to be reported?',
    a: 'For each beneficial owner (anyone owning ≥25% of the entity or exercising substantial control) and for each company applicant (only for entities formed on or after Jan 1, 2024): full legal name, date of birth, current residential address, and an identifying number from a non-expired U.S. driver license, state ID, or U.S./foreign passport — plus a clear image of that document.',
  },
  {
    q: 'How does LaunchForma handle BOI?',
    a: 'You upload IDs and ownership info inside an encrypted form. We prepare the FinCEN BOIR submission, route it through an internal compliance review, file it on your behalf, and store the submission acknowledgement in your dashboard. The fee is a flat $49 per filing, and you receive the FinCEN tracking ID and a downloadable copy of what was filed.',
  },
  {
    q: 'What are the penalties for not filing?',
    a: 'Failing to file or knowingly providing false information can carry civil penalties of $500/day (adjusted for inflation) and criminal penalties up to $10,000 and/or 2 years imprisonment under the CTA. We strongly recommend filing on time even if you believe you might be exempt — exemption status can change as your company grows.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. PII (IDs, SSNs/ITINs when needed) is encrypted at rest with AES-256 via our internal encryption helper and in transit via TLS 1.2+. Access is role-restricted; only authorized compliance staff can decrypt submission data, and every decryption is audit-logged. We do not sell or share BOI data with third parties.',
  },
  {
    q: 'Can I file it myself?',
    a: "Yes — FinCEN's BOIR portal accepts direct filings free of charge. We charge $49 because the process involves uploading IDs, classifying owners correctly, and tracking the 30-day update obligation indefinitely. If you'd rather DIY, fincen.gov/boi is the official portal.",
  },
];

export default function BoiReportingPage() {
  return (
    <>
      <JsonLd data={faqPageJsonLd(BOI_FAQ)} />

      {/* Hero */}
      <section className="pt-16 pb-10">
        <div className="container max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/5 border border-primary/15 px-3 py-1 rounded-full">
            <ShieldAlert className="h-3.5 w-3.5" />
            BOI Filing — Corporate Transparency Act
          </span>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-medium tracking-tight">
            Stay FinCEN-compliant —{' '}
            <span className="italic text-primary">for $49.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            Most U.S. LLCs and Corporations must file a Beneficial Ownership
            Information report with FinCEN. LaunchForma prepares, reviews, and
            submits yours — encrypted in transit and at rest, with the FinCEN
            tracking ID delivered straight to your dashboard.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/start"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-md font-semibold hover:bg-primary-hover transition-colors"
            >
              Add BOI filing — $49
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#faq"
              className="inline-flex items-center justify-center gap-2 border border-border bg-white text-ink px-6 py-3 rounded-md font-semibold hover:bg-muted transition-colors"
            >
              How it works
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            Flat $49 per filing · No subscription · 30-day update tracking included for 12 months
          </p>
        </div>
      </section>

      {/* Why this matters */}
      <section className="py-12 bg-white border-y border-border">
        <div className="container max-w-5xl">
          <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-center mb-10">
            Why every new LLC and Corporation should care
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <Clock className="h-5 w-5" />,
                title: '30-day filing window',
                body: 'Entities formed on or after January 1, 2025 must file within 30 days of formation. Updates (new beneficial owner, address change) must be reported within 30 days of the change.',
              },
              {
                icon: <Receipt className="h-5 w-5" />,
                title: 'Penalties are steep',
                body: 'Civil penalties up to $500/day (inflation-adjusted) and criminal penalties up to $10,000 and/or 2 years imprisonment under the CTA. Filing on time is dramatically cheaper than not.',
              },
              {
                icon: <Lock className="h-5 w-5" />,
                title: 'Sensitive data, handled right',
                body: 'IDs and PII encrypted at rest with AES-256 and in transit via TLS 1.2+. Access is audit-logged. We never sell or share BOI data with marketing partners.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-border bg-white p-6"
              >
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

      {/* What we file */}
      <section className="py-12">
        <div className="container max-w-3xl">
          <h2 className="font-display text-3xl font-medium tracking-tight mb-6">
            What&apos;s included with $49 BOI filing
          </h2>
          <ul className="space-y-3">
            {[
              'Beneficial-owner identification and exemption screening before filing',
              'Encrypted intake of IDs (drivers license, state ID, or passport)',
              'Preparation and internal review of the FinCEN BOIR submission',
              'Submission to FinCEN via the official BOIR portal',
              'FinCEN tracking ID delivered to your LaunchForma dashboard',
              'Audit-logged storage of the filed copy for your records',
              '30-day update tracking for the first 12 months (you tell us about a change, we file the amendment)',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3 text-sm text-ink-muted">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 bg-white border-y border-border">
        <div className="container max-w-3xl">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Frequently asked
            </span>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-medium tracking-tight">
              BOI filing — answered.
            </h2>
          </div>
          <div className="space-y-4">
            {BOI_FAQ.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-border bg-white p-5"
              >
                <p className="font-semibold text-ink">{item.q}</p>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-ink-muted">
            See FinCEN&apos;s official BOI portal at{' '}
            <a
              href="https://www.fincen.gov/boi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              fincen.gov/boi
            </a>{' '}
            for the current rule text and enforcement updates.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8">
        <div className="container max-w-3xl">
          <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
            <FileText className="h-4 w-4 text-ink-subtle shrink-0 mt-0.5" />
            <p className="text-xs text-ink-subtle leading-relaxed">
              LaunchForma is not a law firm and this page is not legal advice.
              Exemption status and enforcement deadlines have been actively
              litigated — confirm current rules at{' '}
              <a
                href="https://www.fincen.gov/boi"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
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
