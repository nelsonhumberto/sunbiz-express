'use client';

import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface ChannelPreset {
  label: string;
  source: string;
  medium: string;
  dynamic: string;
  note: string;
}

const CHANNELS: Record<string, ChannelPreset> = {
  google_search: {
    label: 'Google Search (cpc)',
    source: 'google',
    medium: 'cpc',
    dynamic: 'utm_term={keyword}&utm_content={creative}',
    note: 'Use {keyword} ValueTrack in the Final URL suffix. Google appends gclid automatically for conversion import.',
  },
  google_pmax: {
    label: 'Google Performance Max / Display',
    source: 'google',
    medium: 'display',
    dynamic: 'utm_content={creative}',
    note: 'Set at the campaign level via Final URL suffix.',
  },
  facebook: {
    label: 'Facebook (Meta)',
    source: 'facebook',
    medium: 'paid-social',
    dynamic: 'utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}',
    note: 'Paste the dynamic string into Ad level → "URL parameters". Meta fills the names automatically.',
  },
  instagram: {
    label: 'Instagram (Meta)',
    source: 'instagram',
    medium: 'paid-social',
    dynamic: 'utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}',
    note: 'Same Ads Manager as Facebook — only utm_source differs (split by placement or duplicate the campaign).',
  },
  tiktok: {
    label: 'TikTok',
    source: 'tiktok',
    medium: 'paid-social',
    dynamic: 'utm_campaign=__CAMPAIGN_NAME__&utm_content=__AID_NAME__',
    note: 'TikTok supports macro tokens in the tracking URL — check current macro names in Ads Manager.',
  },
  youtube: {
    label: 'YouTube',
    source: 'youtube',
    medium: 'video',
    dynamic: 'utm_content={creative}',
    note: 'Managed through Google Ads — set via Final URL suffix like Search.',
  },
  email: {
    label: 'Email',
    source: 'email',
    medium: 'email',
    dynamic: '(set per send)',
    note: 'Tag each broadcast with a unique utm_campaign + utm_content (email-01, email-02…).',
  },
  referral: {
    label: 'Referral / Partner',
    source: 'referral',
    medium: 'referral',
    dynamic: '(set per partner)',
    note: 'Give partners a unique utm_campaign so you can attribute their traffic.',
  },
};

const LANDING_PAGES = [
  { value: '/offer', label: '/offer — paid-ad landing (recommended)' },
  { value: '/start', label: '/start — straight into guest intake' },
  { value: '/', label: '/ — homepage' },
  { value: '/pricing', label: '/pricing — package comparison' },
];

const STATES = [
  { value: 'FL', label: 'Florida (FL)' },
  { value: 'WY', label: 'Wyoming (WY)' },
  { value: 'DE', label: 'Delaware (DE)' },
];

const TIERS = [
  { value: '', label: 'No preselected package' },
  { value: 'BASIC', label: 'Essential (BASIC)' },
  { value: 'STANDARD', label: 'Popular (STANDARD)' },
  { value: 'PREMIUM', label: 'Premium (PREMIUM)' },
];

const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish (lang=es)' },
];

const ORIGIN = 'https://launchforma.com';

const EXAMPLES: { use: string; url: string }[] = [
  {
    use: 'Google Search · FL LLC',
    url: 'https://launchforma.com/offer?state=FL&tier=STANDARD&utm_source=google&utm_medium=cpc&utm_campaign=en-fl-llc&utm_content=rsa-1&utm_term={keyword}',
  },
  {
    use: 'Google Search · Spanish',
    url: 'https://launchforma.com/offer?lang=es&state=FL&utm_source=google&utm_medium=cpc&utm_campaign=es-fl-llc&utm_content=rsa-1&utm_term={keyword}',
  },
  {
    use: 'Facebook · cold FL',
    url: 'https://launchforma.com/offer?state=FL&utm_source=facebook&utm_medium=paid-social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}',
  },
  {
    use: 'Instagram · Latino founder',
    url: 'https://launchforma.com/offer?lang=es&state=FL&utm_source=instagram&utm_medium=paid-social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}',
  },
  {
    use: 'Meta retarget · pricing',
    url: 'https://launchforma.com/pricing?utm_source=facebook&utm_medium=paid-social&utm_campaign=en-pricing&utm_content=carousel-01&utm_term=retarget-30d',
  },
];

function buildUrl(opts: {
  path: string;
  state: string;
  tier: string;
  lang: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}): string {
  const params: string[] = [];
  if (opts.lang === 'es') params.push('lang=es');
  if (opts.state) params.push(`state=${opts.state}`);
  const tierApplies = opts.path === '/offer' || opts.path === '/start';
  if (opts.tier && tierApplies) params.push(`tier=${opts.tier}`);
  params.push(`utm_source=${opts.source}`);
  params.push(`utm_medium=${opts.medium}`);
  if (opts.campaign) params.push(`utm_campaign=${opts.campaign.trim()}`);
  if (opts.content) params.push(`utm_content=${opts.content.trim()}`);
  if (opts.term) params.push(`utm_term=${opts.term.trim()}`);
  return `${ORIGIN}${opts.path}${params.length ? `?${params.join('&')}` : ''}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

export function UtmBuilder() {
  const [channel, setChannel] = useState('google_search');
  const [path, setPath] = useState('/offer');
  const [stateCode, setStateCode] = useState('FL');
  const [tier, setTier] = useState('');
  const [lang, setLang] = useState('en');
  const [campaign, setCampaign] = useState('en-fl-llc');
  const [content, setContent] = useState('rsa-1');
  const [term, setTerm] = useState('{keyword}');
  const [copied, setCopied] = useState(false);

  const preset = CHANNELS[channel] ?? CHANNELS.google_search;
  const url = useMemo(
    () =>
      buildUrl({
        path,
        state: stateCode,
        tier,
        lang,
        source: preset.source,
        medium: preset.medium,
        campaign,
        content,
        term,
      }),
    [path, stateCode, tier, lang, preset.source, preset.medium, campaign, content, term],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can select the text */
    }
  };

  return (
    <div className="container max-w-4xl py-12 space-y-10">
      <header className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Internal · marketing
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
          UTM Link Builder
        </h1>
        <p className="text-ink-muted max-w-2xl leading-relaxed">
          Build tracked ad links for Google, Meta, and other channels. Every value flows into
          analytics automatically: the first click is captured in a 30-day cookie and attached to
          the <code className="text-primary">signup_started</code> and{' '}
          <code className="text-primary">purchase_completed</code> events, plus the User
          (first-touch) and Filing (last-touch) records.
        </p>
      </header>

      {/* Builder */}
      <section className="rounded-2xl border border-border bg-white p-6 md:p-8 shadow-soft space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Channel">
            <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {Object.entries(CHANNELS).map(([v, c]) => (
                <option key={v} value={v}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Landing page">
            <select className={inputCls} value={path} onChange={(e) => setPath(e.target.value)}>
              {LANDING_PAGES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="State">
            <select className={inputCls} value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
              {STATES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <select className={inputCls} value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preselect package (/offer, /start only)">
            <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
              {TIERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="utm_campaign">
            <input
              className={inputCls}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="en-fl-llc"
            />
          </Field>
          <Field label="utm_content (creative)">
            <input
              className={inputCls}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="rsa-1 / reel-01"
            />
          </Field>
          <Field label="utm_term (keyword / audience)">
            <input
              className={inputCls}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="{keyword}"
            />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              Your ad URL
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
          <code className="block rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink break-all">
            {url}
          </code>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-ink">Platform auto-fill (paste into the platform, not here)</p>
          <p className="mt-1 text-ink-muted">
            For this channel, set the platform&apos;s URL-parameters field to:{' '}
            <code className="text-primary break-all">{preset.dynamic}</code>
          </p>
          <p className="mt-1 text-ink-subtle text-[13px]">{preset.note}</p>
        </div>
      </section>

      {/* Examples */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">Ready-to-paste examples</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 font-semibold text-ink-subtle">Use case</th>
                <th className="px-4 py-2.5 font-semibold text-ink-subtle">URL</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((ex) => (
                <tr key={ex.use} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2.5 text-ink whitespace-nowrap">{ex.use}</td>
                  <td className="px-4 py-2.5">
                    <code className="text-ink-muted break-all">{ex.url}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Where the data lands */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">Where to see the data</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="font-semibold text-ink">PostHog</p>
            <p className="mt-1 text-sm text-ink-muted">
              Funnels (<code>signup_started → purchase_completed</code>) by{' '}
              <code>utm_campaign</code>/<code>utm_source</code>.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="font-semibold text-ink">Ad platform</p>
            <p className="mt-1 text-sm text-ink-muted">
              Clicks, CPC, and conversions in Google Ads / Meta Ads Manager.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="font-semibold text-ink">Database</p>
            <p className="mt-1 text-sm text-ink-muted">
              <code>User.utmCampaign</code> (first touch) and <code>Filing.utmCampaign</code> (last
              touch) tie revenue to campaigns.
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-subtle">
          Tip: keep <code>utm_campaign</code> values lowercase and hyphenated (e.g.{' '}
          <code>es-fl-latinofounder</code>) so reports group cleanly.
        </p>
      </section>
    </div>
  );
}
