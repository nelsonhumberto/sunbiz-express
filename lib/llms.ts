/**
 * Generates the `/llms.txt` and `/llms-full.txt` documents.
 *
 * llms.txt is an emerging convention (https://llmstxt.org) that gives LLM
 * crawlers and AI answer engines a clean, curated markdown map of the site:
 * an H1 with the brand, a one-line blockquote summary, then link sections.
 * `/llms-full.txt` expands that with inline reference content (FAQ answers,
 * pricing/service overview) so models can answer from a single fetch.
 *
 * Both are built from the same source-of-truth modules used to render the
 * marketing site, so they stay in sync automatically.
 */

import { ALL_MARKETING_STATES, FLORIDA, localizedStateName } from '@/lib/marketing-states';
import { getMarketingFaq } from '@/lib/marketing-faq';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

const SUMMARY =
  'LaunchForma is a modern business formation service that files LLCs and Corporations in Florida, Wyoming, and Delaware with transparent all-in pricing (state fee included), a free Year-1 Registered Agent, and same-business-day submission.';

const ABOUT =
  'LaunchForma helps founders form US companies without the upsells, hidden fees, or 45-minute forms common to legacy filing services. Every package includes the required state filing fee, free Year-1 Registered Agent service, and digital delivery of filed documents. Optional add-ons include EIN acquisition, Operating Agreements, S-Corp election (IRS Form 2553), and Certificate of Status. The company also files Florida annual reports and BOI reports. LaunchForma is not a law firm and does not provide legal advice.';

interface LinkEntry {
  title: string;
  path: string;
  note: string;
}

const CORE_PAGES: LinkEntry[] = [
  { title: 'Home', path: '/', note: 'Overview of LaunchForma formation services and pricing.' },
  { title: 'Pricing', path: '/pricing', note: 'All-in package pricing for LLC and Corporation formation; state fee included.' },
  { title: 'Services', path: '/services', note: 'Add-on services: EIN, Operating Agreement, S-Corp election, Certificate of Status.' },
  { title: 'FAQ', path: '/faq', note: 'Answers about formation, registered agent, EIN, annual reports, and timelines.' },
  { title: 'About', path: '/about', note: 'Company mission: transparent, all-in business formation.' },
  { title: 'File an Annual Report', path: '/file-annual-report', note: 'Florida annual report filing service and deadlines.' },
  { title: 'BOI Reporting', path: '/boi-reporting', note: 'Beneficial Ownership Information (FinCEN) reporting overview.' },
  { title: 'States', path: '/states', note: 'States where LaunchForma files and coming-soon states.' },
  { title: 'Start a filing', path: '/start', note: 'Begin an LLC, Corporation, or S-Corp filing (no account required).' },
];

const GUIDES: LinkEntry[] = [
  { title: 'Guides index', path: '/guides', note: 'Long-form formation and compliance guides.' },
  { title: 'Wyoming LLC vs Delaware Corp', path: '/guides/wyoming-llc-vs-delaware-corp', note: 'Compare Wyoming LLC and Delaware C-Corp for privacy, taxes, and fundraising.' },
  { title: 'Florida LLC Operating Agreement', path: '/guides/florida-llc-operating-agreement', note: 'Why and how to create a Florida LLC operating agreement.' },
  { title: 'BOI Filing 2026', path: '/guides/boi-filing-2026', note: 'Beneficial Ownership Information reporting requirements and deadlines.' },
];

const LEGAL: LinkEntry[] = [
  { title: 'Terms', path: '/terms', note: 'Terms of service.' },
  { title: 'Privacy Policy', path: '/privacy', note: 'How LaunchForma handles data; no data sales.' },
  { title: 'Disclaimer', path: '/disclaimer', note: 'Not-a-law-firm disclaimer.' },
  { title: 'Refund Policy', path: '/refund-policy', note: 'Refund terms.' },
];

function line(entry: LinkEntry): string {
  return `- [${entry.title}](${BASE_URL}${entry.path}): ${entry.note}`;
}

function stateLines(): string[] {
  const active = ALL_MARKETING_STATES.filter((s) => s.availability === 'active');
  return active.map((s) => {
    // Florida is the canonical homepage; other active states have /states/{slug}.
    const path = s.code === 'FL' ? '/' : `/states/${s.slug}`;
    return `- [${s.name} LLC & Corporation formation](${BASE_URL}${path}): File a ${s.name} LLC or Corporation with all-in pricing and free Year-1 Registered Agent.`;
  });
}

/** Curated llms.txt: brand, summary, and grouped link sections. */
export function buildLlmsTxt(): string {
  const parts: string[] = [];
  parts.push('# LaunchForma');
  parts.push('');
  parts.push(`> ${SUMMARY}`);
  parts.push('');
  parts.push(ABOUT);
  parts.push('');
  parts.push('## Core pages');
  parts.push(...CORE_PAGES.map(line));
  parts.push('');
  parts.push('## Guides');
  parts.push(...GUIDES.map(line));
  parts.push('');
  parts.push('## States');
  parts.push(...stateLines());
  parts.push('');
  parts.push('## Legal');
  parts.push(...LEGAL.map(line));
  parts.push('');
  parts.push('## Optional');
  parts.push(
    `- [Full text export](${BASE_URL}/llms-full.txt): Expanded version of this file with inline FAQ answers.`,
  );
  parts.push(`- [Sitemap](${BASE_URL}/sitemap.xml): Machine-readable list of all indexable URLs.`);
  parts.push('');
  return parts.join('\n');
}

/** Expanded llms-full.txt: everything in llms.txt plus inline FAQ content. */
export function buildLlmsFullTxt(): string {
  const parts: string[] = [];
  parts.push(buildLlmsTxt().trimEnd());
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## Frequently asked questions');
  parts.push('');

  const faq = getMarketingFaq(FLORIDA, 'en');
  for (const item of faq) {
    parts.push(`### ${item.q}`);
    parts.push(item.a);
    parts.push('');
  }

  parts.push('---');
  parts.push('');
  parts.push('## Coverage');
  const coming = ALL_MARKETING_STATES.filter((s) => s.availability === 'coming_soon')
    .map((s) => localizedStateName(s, 'en'))
    .join(', ');
  parts.push(
    `LaunchForma files today in Florida, Wyoming, and Delaware. Waitlists are open for other US states: ${coming}.`,
  );
  parts.push('');
  return parts.join('\n');
}
