import type { Metadata } from 'next';
import { GuideLayout } from '@/components/marketing/GuideLayout';

const PUBLISHED = '2026-05-27';

export const metadata: Metadata = {
  title: 'Wyoming LLC vs Delaware Corp: Which State Should You Choose?',
  description:
    'A founder-friendly comparison of forming a Wyoming LLC versus a Delaware C-Corp - taxes, privacy, annual cost, investor expectations, and when each makes sense.',
  alternates: { canonical: '/guides/wyoming-llc-vs-delaware-corp' },
  openGraph: {
    title: 'Wyoming LLC vs Delaware Corp - Which Should You Choose?',
    description:
      'Side-by-side comparison: privacy, asset protection, taxes, annual costs, and investor expectations.',
    type: 'article',
    publishedTime: PUBLISHED,
  },
};

export default function WyomingVsDelawareGuide() {
  return (
    <GuideLayout
      slug="wyoming-llc-vs-delaware-corp"
      title="Wyoming LLC vs Delaware Corp: Which State Should You Choose?"
      description="Same question, different answer depending on whether you are a solo operator, a holding company, or a venture-track founder. Here is the founder-friendly breakdown."
      datePublished={PUBLISHED}
      readingMinutes={8}
      cta={{
        headline: 'Ready to file?',
        subhead:
          'LaunchForma files Wyoming LLCs and Delaware Corporations with all-in pricing, free Year-1 Registered Agent, and BOI filing as a $49 add-on.',
        href: '/states',
        label: 'See state pricing',
      }}
    >
      <h2>TL;DR</h2>
      <ul>
        <li>
          <strong>Pick a Wyoming LLC</strong> if you are a small operator,
          holding company, real-estate investor, or anyone whose priorities are
          <em> privacy, low ongoing cost, and strong asset protection</em>.
        </li>
        <li>
          <strong>Pick a Delaware C-Corporation</strong> if you intend to
          <em> raise venture capital, issue equity to employees, or sell to a
          U.S. acquirer</em>. Investors expect Delaware. Period.
        </li>
        <li>
          The two are <em>not</em> apples-to-apples - they are different entity
          types in different states, optimized for different outcomes. Pick the
          outcome first, then the form follows.
        </li>
      </ul>

      <h2>1. Cost (year one + ongoing)</h2>
      <h3>Wyoming LLC</h3>
      <ul>
        <li>State filing fee: $100 (LLC Articles of Organization).</li>
        <li>
          Annual report / License Tax: minimum <strong>$60/year</strong>, due on
          the first of your anniversary month.
        </li>
        <li>Registered agent (required, must have WY physical address): $0 first year with LaunchForma, $119/year on renewal.</li>
      </ul>

      <h3>Delaware C-Corp</h3>
      <ul>
        <li>State filing fee: $109 minimum (Certificate of Incorporation with up to 1,500 authorized shares, no par value).</li>
        <li>
          Annual Report + Franchise Tax: <strong>$225 minimum/year</strong> for small companies under the Authorized Shares method - and the franchise tax can rise sharply if you authorize a lot of shares without setting par value carefully.
        </li>
        <li>Registered agent (required, must have DE physical address): $0 first year with LaunchForma, $149/year on renewal.</li>
      </ul>

      <p>
        Bottom line: Wyoming costs about <strong>$60–$120/year</strong> to keep
        in good standing. Delaware costs <strong>$225+/year</strong> minimum
        plus the higher registered agent. If cost is the deciding factor, the
        gap matters.
      </p>

      <h2>2. Privacy</h2>
      <p>
        Wyoming does not publicly list LLC members or managers on the Articles
        of Organization. Delaware does not require initial LLC member names on
        the Certificate of Formation either - and for Corporations, only the
        incorporator&apos;s name is public on formation.
      </p>
      <p>
        Both states are strong on entity privacy. <strong>Wyoming edges
        Delaware</strong> for an LLC formed purely for privacy / asset
        protection because Wyoming&apos;s annual report does not require
        member disclosure, while Delaware&apos;s corporate annual report does.
      </p>

      <h2>3. Asset protection</h2>
      <p>
        Wyoming has the strongest single-member-LLC charging-order protection
        in the country - a creditor of an LLC member can attach distributions
        but cannot force a sale of the membership interest. Delaware LLC law
        also offers charging-order protection, but Wyoming&apos;s case law is
        considered more debtor-friendly for single-member LLCs.
      </p>

      <h2>4. Taxes</h2>
      <p>
        <strong>Wyoming</strong> has no state income tax on businesses, no
        franchise tax, and no gross receipts tax. As an LLC, you are
        pass-through taxed by default - profits flow to your federal return.
      </p>
      <p>
        <strong>Delaware</strong> has no state sales tax, and Delaware does not
        tax corporate income on entities that do not operate <em>in</em>{' '}
        Delaware. But Delaware Corporations pay the annual franchise tax we
        mentioned above. Delaware LLCs pay a flat $300/year Annual Tax.
      </p>
      <p>
        If you are operating in another state (where your customers and
        employees actually live), <em>that</em> state will tax you regardless of
        where you formed. Formation state ≠ operating state.
      </p>

      <h2>5. Investor expectations</h2>
      <p>
        This is the single biggest reason most U.S. venture-backed startups
        incorporate in Delaware: <strong>investors expect it</strong>. The
        Delaware Court of Chancery is the country&apos;s premier business
        court, the case law is deep and predictable, and standard VC documents
        (SAFE, convertible note, Series Seed) are drafted with Delaware General
        Corporation Law in mind. If you plan to raise from professional
        investors, save yourself the conversion cost and incorporate in
        Delaware on day one.
      </p>
      <p>
        Conversely, a Wyoming LLC will be a non-starter for institutional
        investors. You will end up converting to a Delaware C-Corp before any
        priced round closes, and that conversion costs money and lawyer time.
      </p>

      <h2>6. Foreign qualification</h2>
      <p>
        Forming in Wyoming or Delaware does not authorize you to do business
        anywhere else. If you have an office, employees, or significant
        revenue in another state, that state typically requires a separate
        &quot;foreign qualification&quot; filing (also called Certificate of
        Authority). Each state has its own form, fee, and ongoing registered
        agent requirement. Budget for it.
      </p>

      <h2>7. BOI / FinCEN</h2>
      <p>
        Both Wyoming and Delaware entities are subject to the federal Corporate
        Transparency Act. Most LLCs and Corporations formed in 2025 or later
        must file a{' '}
        <a href="/boi-reporting">Beneficial Ownership Information</a> report
        with FinCEN within 30 days of formation. State choice does not change
        that.
      </p>

      <h2>So which one?</h2>
      <ul>
        <li>
          Operating a small business, freelancing, holding rentals, asset
          protection? → <strong>Wyoming LLC.</strong>
        </li>
        <li>
          Planning to raise outside capital, issue stock, or sell? →{' '}
          <strong>Delaware C-Corp.</strong>
        </li>
        <li>
          Living and operating in a specific state with no VC plans? →{' '}
          <strong>Form in that state.</strong> Forming in WY/DE just adds a
          second registered agent bill and a foreign-qualification filing.
        </li>
      </ul>

      <p className="not-prose text-xs text-ink-subtle mt-8">
        LaunchForma is not a law firm and this guide is not legal or tax
        advice. For complex situations - multiple founders with different
        interests, professional licensing, securities offerings - talk to a
        CPA or attorney before filing.
      </p>
    </GuideLayout>
  );
}
