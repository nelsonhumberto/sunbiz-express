import { Heart, Target, Eye, Sparkles } from 'lucide-react';
import { CTABanner } from '@/components/marketing/CTABanner';

export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <>
      <section className="pt-16 pb-12">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">About</span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            Built for the{' '}
            <span className="italic text-primary">Florida</span> entrepreneur.
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            We believe forming a business should be as simple as ordering coffee. IncServices
            exists to fix the mess of LegalZoom upsells, hidden fees, and Sunbiz forms designed in
            1998.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
          <ValueCard
            icon={<Target className="h-5 w-5" />}
            title="Mission"
            body="To make business formation in Florida fast, transparent, and accessible to anyone with a dream — not just lawyers and accountants."
          />
          <ValueCard
            icon={<Eye className="h-5 w-5" />}
            title="Vision"
            body="A world where starting a legitimate business is so simple you can do it on your lunch break — and where compliance never sneaks up on you."
          />
          <ValueCard
            icon={<Heart className="h-5 w-5" />}
            title="Values"
            body="Transparency over upsells. Privacy over data harvesting. Speed over bureaucracy. Plain language over legalese."
          />
        </div>
      </section>

      <section id="why" className="py-12 md:py-20 bg-white border-y border-border">
        <div className="container max-w-3xl">
          <h2 className="font-display text-4xl font-medium tracking-tight text-center mb-10">
            Why we built this
          </h2>
          <div className="prose prose-lg max-w-none text-ink-muted leading-relaxed">
            <p>
              We were filing our own LLCs through LegalZoom in 2024 and got hit with the same trap
              everyone gets hit with: a $0 "free" formation that ballooned to $399 by the time we
              hit the checkout. Registered agent for $249/year. Operating agreement for $99.
              Compliance reminders for another $99/year.
            </p>
            <p>
              Meanwhile, Florida's official Sunbiz portal looks like it was last updated when
              Netscape was a thing. The state filing fee is $125 — a fact that's deliberately buried
              under three pages of optional services on every competitor's website.
            </p>
            <p>
              <strong className="text-ink">We thought there had to be a better way.</strong>
            </p>
            <p>
              IncServices is what we wished existed when we filed our own businesses: a clean,
              modern, transparent platform with one all-in package price (Florida filing fee
              already included), the year-1 registered agent for free (because everyone needs one
              and charging for it is the silliest gotcha in legal-tech), and no surprise checkout
              fees stacked on top.
            </p>
            <p>
              Most importantly — we don't sell your data. Your name, address, and SSN aren't being
              monetized through "marketing partners." When you pay our service fee, that's it.
            </p>
          </div>
        </div>
      </section>

      <section id="contact" className="py-16">
        <div className="container max-w-2xl text-center">
          <Sparkles className="h-8 w-8 mx-auto text-accent mb-3" />
          <h2 className="font-display text-3xl font-medium tracking-tight">Get in touch</h2>
          <p className="mt-3 text-ink-muted">
            Email{' '}
            <a href="mailto:hello@incservices.example" className="text-primary font-medium hover:underline">
              hello@incservices.example
            </a>
            <br />
            We respond within one business day. No bots, no hold music, no "Tier 1 support" runaround.
          </p>
        </div>
      </section>

      <CTABanner />
    </>
  );
}

function ValueCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-display text-xl font-medium">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}
