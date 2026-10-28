'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { openGuestDraft } from '@/actions/guest-start';
import { captureChecklistSignup } from '@/actions/checklist-signup';
import { Link } from '@/i18n/navigation';
import {
  captureThenNavigate,
  filingIdFromWizardPath,
  startNavigationEvents,
  trackCtaClicked,
  trackEvent,
  trackGoogleBeginFiling,
} from '@/lib/analytics';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';
import { hrefWithAttribution } from '@/lib/preserve-attribution';
import { TIERS, tierPackagePriceCents, tierPriceParts, type TierSlug } from '@/lib/pricing';
import { TIER_FEATURE_KEYS } from '@/lib/pricing-i18n';
import { feeSplitLabel } from '@/components/marketing/fee-split';
import { startNameIsAcceptable } from '@/lib/start-draft';
import { newlyReachedScrollDepths } from '@/lib/scroll-depth';
import { checklistCopy, type DripLocale } from '@/lib/drip-copy';
import { localizedHref } from '@/lib/locale-paths';
import { cn, formatCurrency } from '@/lib/utils';

const NAVIGATION_FALLBACK_MS = 4000;
const VALID_TIERS = new Set<TierSlug>(['BASIC', 'STANDARD', 'PREMIUM']);
/** Exact sentence from the Florida LLC cost guide. No Spanish twin exists in the repo. */
export const MIAMI_LAKES_EN =
  'LaunchForma files Florida LLCs online from our Miami Lakes office.';

function asTier(value: string | undefined): TierSlug {
  const upper = (value ?? '').toUpperCase();
  return VALID_TIERS.has(upper as TierSlug) ? (upper as TierSlug) : 'STANDARD';
}

export function FloridaLlcLanding({
  attributionSearch,
  initialTier,
  floridaNote,
  stateName,
  accountEmail,
  isTester,
  trustLines,
}: {
  attributionSearch: string;
  initialTier?: string;
  floridaNote: string;
  stateName: string;
  accountEmail?: string | null;
  isTester?: boolean;
  trustLines: string[];
}) {
  const t = useTranslations('start');
  const tLp = useTranslations('lpFlorida');
  const tPricing = useTranslations('pricing');
  const tHow = useTranslations('howItWorks');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const lang: DripLocale = locale;
  const checklist = checklistCopy(lang);
  const router = useRouter();
  const [name, setName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TierSlug>(asTier(initialTier));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSticky, setShowSticky] = useState(false);
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const timers = useRef<number[]>([]);
  const seenDepth = useRef(new Set<number>());
  const price = formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL'));
  const parts = tierPriceParts('BASIC', 'LLC', 'FL');
  const breakdown = feeSplitLabel(
    (key, values) => tPricing(key as 'feeSplit', values),
    parts,
    stateName,
    'BASIC',
  );

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const percent = max <= 0 ? 100 : (window.scrollY / max) * 100;
      for (const depth of newlyReachedScrollDepths(percent, seenDepth.current)) {
        seenDepth.current.add(depth);
        trackEvent('scroll_depth', { depth, path: window.location.pathname });
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function startHref(tier: TierSlug, businessName: string) {
    const params = new URLSearchParams();
    params.set('tier', tier);
    const trimmed = businessName.trim();
    if (trimmed) params.set('name', trimmed);
    return hrefWithAttribution(`/start?${params.toString()}`, attributionSearch);
  }

  function focusName() {
    document.getElementById('lp-business-name')?.scrollIntoView({ block: 'center' });
    document.getElementById('lp-business-name')?.focus();
  }

  async function openDraft(tier: TierSlug, businessName: string, location: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    const trimmed = businessName.trim();
    trackCtaClicked('lp_continue', { location, tier });
    try {
      const result = await withActionTimeout(
        openGuestDraft({
          state: 'FL',
          entityType: 'LLC',
          tier,
          businessName: trimmed,
          email: leadEmail.trim() || undefined,
          browserPath: window.location.pathname,
          returnRedirect: true,
        }),
        WIZARD_ACTION_TIMEOUT_MS,
      );
      const redirectTo = result?.redirectTo;
      if (!redirectTo) {
        setError(result?.error ?? t('errorStart'));
        setPending(false);
        return;
      }
      trackGoogleBeginFiling({ isTester, emails: [accountEmail, leadEmail] });
      const nextHref = hrefWithAttribution(redirectTo, window.location.search || attributionSearch);
      await captureThenNavigate({
        events: startNavigationEvents({
          filingId: filingIdFromWizardPath(redirectTo),
          locale,
          entity: 'LLC',
        }),
        navigate: () => {
          const fromPath = window.location.pathname;
          router.push(nextHref);
          timers.current.push(
            window.setTimeout(() => {
              if (window.location.pathname !== fromPath) return;
              setPending(false);
              window.location.assign(nextHref);
            }, NAVIGATION_FALLBACK_MS),
          );
        },
      });
    } catch (err) {
      const href = redirectHrefFromError(err);
      if (href) {
        trackGoogleBeginFiling({ isTester, emails: [accountEmail, leadEmail] });
        const nextHref = hrefWithAttribution(href, window.location.search);
        await captureThenNavigate({
          events: startNavigationEvents({
            filingId: filingIdFromWizardPath(href),
            locale,
            entity: 'LLC',
          }),
          navigate: () => router.push(nextHref),
        });
        return;
      }
      if (isRedirectError(err)) return;
      setError(err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorStart'));
      setPending(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!startNameIsAcceptable(trimmed)) {
      setError(t('companyNameInvalid'));
      return;
    }
    void openDraft(selected, trimmed, 'hero');
  }

  async function onLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadError(null);
    if (!consent) {
      setLeadError(checklist.errorConsent);
      return;
    }
    const result = await captureChecklistSignup({
      email: leadEmail,
      consent: true,
      locale: lang,
      source: 'lp-florida-llc',
    });
    if (!result.ok) {
      setLeadError(result.error === 'invalid-email' ? checklist.errorEmail : checklist.errorGeneric);
      return;
    }
    trackEvent('lead_capture_submitted', { source: 'lp-florida-llc', locale: lang });
    setLeadDone(true);
  }

  return (
    <div className="pb-28">
      <section data-testid="lp-hero" className="container max-w-lg px-4 pt-1">
        <h1 className="text-center font-display text-xl font-medium leading-tight tracking-tight sm:text-4xl">
          {tPricing('pageHeadline', { state: stateName })}
        </h1>
        <p data-testid="lp-value" className="mt-1 text-center text-lg font-semibold leading-none">
          {price} {tPricing('allIn')}
        </p>
        <p data-testid="lp-breakdown" className="mt-1 text-center text-[11px] leading-snug text-ink-muted">
          {breakdown}
        </p>
        <p data-testid="lp-promise" className="text-center text-[11px] font-medium leading-snug">
          {tPricing('feat_sameDay')}
        </p>
        <form onSubmit={onSubmit} className="mt-2" noValidate>
          <label htmlFor="lp-business-name" className="text-sm font-medium">
            {t('nameYourLlc')}
          </label>
          <input
            id="lp-business-name"
            name="businessName"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            autoComplete="organization"
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={100}
            placeholder={t('companyNamePlaceholder')}
            aria-invalid={error ? true : undefined}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3 text-base"
          />
          {error ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <button
            ref={ctaRef}
            type="submit"
            data-testid="lp-cta"
            disabled={pending}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-base font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('continue')}
          </button>
        </form>
        <p className="mt-1 text-center text-[11px] leading-snug text-ink-muted">{floridaNote}</p>
      </section>

      <section className="container max-w-lg px-4 pt-3" aria-label={tLp('emailTitle')}>
        {leadDone ? (
          <p className="text-sm text-ink" role="status">
            {checklist.thanksBody}
          </p>
        ) : (
          <form onSubmit={onLead} noValidate>
            <p className="text-sm font-semibold">{tLp('emailTitle')}</p>
            <input
              type="email"
              name="email"
              value={leadEmail}
              onChange={(event) => setLeadEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder={checklist.emailPlaceholder}
              className="mt-1 h-11 w-full rounded-lg border border-border px-3 text-base"
            />
            <label className="mt-2 flex items-start gap-2 text-[11px] leading-snug text-ink-muted">
              <input
                type="checkbox"
                name="consent"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                {checklist.consentBefore}
                <a href={localizedHref('/privacy', lang)} className="font-medium text-primary underline">
                  {checklist.consentLink}
                </a>
                {checklist.consentAfter}
              </span>
            </label>
            {leadError ? (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {leadError}
              </p>
            ) : null}
            <button type="submit" className="mt-2 h-10 w-full rounded-lg border border-border text-sm font-semibold">
              {tLp('emailButton')}
            </button>
          </form>
        )}
      </section>

      <section className="container max-w-lg px-4 pt-8">
        <h2 className="font-display text-2xl font-medium">{tLp('stepsTitle')}</h2>
        <ol className="mt-3 space-y-3">
          {[
            { title: tHow('step1Title'), body: tHow('step1Body') },
            {
              title: tHow('step2Title'),
              body: tHow('step2Dynamic', {
                basic: tPricing('tier_BASIC'),
                basicPrice: formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL')),
                standard: tPricing('tier_STANDARD'),
                standardPrice: formatCurrency(tierPackagePriceCents('STANDARD', 'LLC', 'FL')),
                premium: tPricing('tier_PREMIUM'),
                premiumPrice: formatCurrency(tierPackagePriceCents('PREMIUM', 'LLC', 'FL')),
                state: stateName,
              }),
            },
            { title: tHow('step4Title'), body: tHow('step4Body') },
          ].map((step, index) => (
            <li key={step.title} className="text-sm leading-snug">
              <p className="font-semibold">
                {index + 1}. {step.title}
              </p>
              <p className="text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container max-w-lg px-4 pt-8">
        <h2 className="font-display text-2xl font-medium">{tLp('needTitle')}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>{tLp('need1')}</li>
          <li>{tLp('need2')}</li>
          <li>{tLp('need3')}</li>
        </ul>
      </section>

      <section data-testid="lp-plans" className="container max-w-lg space-y-2 px-4 pt-8" aria-label={tPricing('kicker')}>
        {TIERS.map((tier) => {
          const tierName = tPricing(`tier_${tier.slug}` as 'tier_BASIC');
          const amount = formatCurrency(tierPackagePriceCents(tier.slug, 'LLC', 'FL'));
          const highlighted = tier.slug === 'STANDARD';
          return (
            <div
              key={tier.slug}
              className={cn(
                'rounded-xl border bg-white px-3 py-2',
                highlighted || selected === tier.slug ? 'border-primary' : 'border-border',
              )}
            >
              {highlighted ? (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {tPricing('ribbon_recommended')}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-pressed={selected === tier.slug}
                  onClick={() => setSelected(tier.slug)}
                  className="min-w-0 text-left"
                >
                  <span className="block text-sm font-medium">{tierName}</span>
                  <span className="font-display text-2xl font-medium leading-none">{amount}</span>
                  <span className="ml-1 text-xs text-ink-subtle">{tPricing('allIn')}</span>
                </button>
                <Link
                  href={startHref(tier.slug, name)}
                  onClick={(event) => {
                    trackCtaClicked('lp_choose', { location: 'plan', tier: tier.slug });
                    const trimmed = name.trim();
                    if (!startNameIsAcceptable(trimmed)) return;
                    event.preventDefault();
                    void openDraft(tier.slug, trimmed, 'plan');
                  }}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold"
                >
                  {tPricing('chooseTier', { name: tierName })}
                </Link>
              </div>
            </div>
          );
        })}
      </section>

      <section className="container max-w-lg px-4 pt-8">
        <h2 className="font-display text-2xl font-medium">{tPricing('whatsIncluded')}</h2>
        <ul className="mt-3 space-y-4">
          {TIERS.map((tier) => (
            <li key={tier.slug}>
              <p className="text-sm font-semibold">{tPricing(`tier_${tier.slug}` as 'tier_BASIC')}</p>
              <ul className="mt-1 space-y-1">
                {tier.features
                  .filter((feature) => feature.included)
                  .map((feature) => {
                    const key = TIER_FEATURE_KEYS[feature.label];
                    if (!key) return null;
                    return (
                      <li key={feature.label} className="text-sm text-ink-muted">
                        {tPricing(key as 'feat_articles')}
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-muted">{tPricing('serviceGuarantee')}</p>
      </section>

      <section className="container max-w-lg px-4 pt-8">
        <h2 className="font-display text-2xl font-medium">{tLp('trustTitle')}</h2>
        <ul className="mt-3 space-y-2 text-sm leading-snug text-ink-muted">
          {trustLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="container max-w-lg px-4 pt-8">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-base font-semibold text-white"
          onClick={() => {
            trackCtaClicked('lp_continue', { location: 'repeat' });
            focusName();
          }}
        >
          {tLp('repeatCta')}
        </button>
      </section>

      {showSticky ? (
        <div
          data-testid="lp-sticky"
          className="fixed inset-x-0 z-40 px-3 pb-1 md:hidden"
          style={{ bottom: 'var(--lf-cookie-h, 0px)' }}
        >
          <button
            type="button"
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white shadow-lg"
            onClick={() => {
              trackCtaClicked('lp_continue', { location: 'sticky' });
              focusName();
            }}
          >
            {tLp('stickyCta')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
