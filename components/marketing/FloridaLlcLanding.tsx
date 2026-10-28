'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { openGuestDraft } from '@/actions/guest-start';
import { Link } from '@/i18n/navigation';
import {
  captureThenNavigate,
  filingIdFromWizardPath,
  startNavigationEvents,
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
import { TIERS, tierPackagePriceCents, type TierSlug } from '@/lib/pricing';
import { TIER_FEATURE_KEYS } from '@/lib/pricing-i18n';
import { startNameIsAcceptable } from '@/lib/start-draft';
import { cn, formatCurrency } from '@/lib/utils';

const NAVIGATION_FALLBACK_MS = 4000;
const VALID_TIERS = new Set<TierSlug>(['BASIC', 'STANDARD', 'PREMIUM']);

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
}: {
  attributionSearch: string;
  initialTier?: string;
  floridaNote: string;
  stateName: string;
  accountEmail?: string | null;
  isTester?: boolean;
}) {
  const t = useTranslations('start');
  const tPricing = useTranslations('pricing');
  const tHero = useTranslations('hero');
  const tHow = useTranslations('howItWorks');
  const router = useRouter();
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<TierSlug>(asTier(initialTier));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const price = formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL'));

  function startHref(tier: TierSlug, businessName: string) {
    const params = new URLSearchParams();
    params.set('tier', tier);
    const trimmed = businessName.trim();
    if (trimmed) params.set('name', trimmed);
    return hrefWithAttribution(`/start?${params.toString()}`, attributionSearch);
  }

  async function openDraft(tier: TierSlug, businessName: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    const trimmed = businessName.trim();
    try {
      const result = await withActionTimeout(
        openGuestDraft({
          state: 'FL',
          entityType: 'LLC',
          tier,
          businessName: trimmed,
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
      trackGoogleBeginFiling({ isTester, emails: [accountEmail] });
      const nextHref = hrefWithAttribution(redirectTo, window.location.search || attributionSearch);
      await captureThenNavigate({
        events: startNavigationEvents({ filingId: filingIdFromWizardPath(redirectTo), locale, entity: 'LLC' }),
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
        trackGoogleBeginFiling({ isTester, emails: [accountEmail] });
        const nextHref = hrefWithAttribution(href, window.location.search);
        await captureThenNavigate({
          events: startNavigationEvents({ filingId: filingIdFromWizardPath(href), locale, entity: 'LLC' }),
          navigate: () => {
            router.push(nextHref);
            window.setTimeout(() => {
              window.location.assign(nextHref);
            }, NAVIGATION_FALLBACK_MS);
          },
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
    void openDraft(selected, trimmed);
  }

  return (
    <div className="pb-8">
      <section data-testid="lp-hero" className="container max-w-lg px-4 pt-2">
        <h1 className="text-center font-display text-2xl font-medium leading-tight tracking-tight sm:text-4xl">
          {t('headline', { state: stateName, entity: t('entityLLC') })}
        </h1>
        <p data-testid="lp-value" className="mt-1 text-center text-sm font-medium leading-snug text-ink">
          {price} {tPricing('allIn')}
          {' · '}
          {tHero('previewBankReadyDetail')}
          {' · '}
          {tPricing('feat_sameDay')}
        </p>
        <p className="mt-1 text-center text-[11px] leading-snug text-ink-muted">{floridaNote}</p>
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
            className="mt-1 h-12 w-full rounded-lg border border-border bg-white px-3 text-base"
          />
          {error ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            data-testid="lp-cta"
            disabled={pending}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary text-base font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('continue')}
          </button>
        </form>
      </section>

      <section data-testid="lp-plans" className="container max-w-lg space-y-2 px-4 pt-4" aria-label={tPricing('kicker')}>
        {TIERS.map((tier) => {
          const tierName = tPricing(`tier_${tier.slug}` as 'tier_BASIC');
          const amount = formatCurrency(tierPackagePriceCents(tier.slug, 'LLC', 'FL'));
          const href = startHref(tier.slug, name);
          return (
            <div
              key={tier.slug}
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2',
                selected === tier.slug ? 'border-primary' : 'border-border',
              )}
            >
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
                href={href}
                onClick={(event) => {
                  const trimmed = name.trim();
                  if (!startNameIsAcceptable(trimmed)) return;
                  event.preventDefault();
                  void openDraft(tier.slug, trimmed);
                }}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold"
              >
                {tPricing('chooseTier', { name: tierName })}
              </Link>
            </div>
          );
        })}
      </section>

      <section className="container max-w-lg px-4 pt-8">
        <h2 className="font-display text-2xl font-medium">{tHow('kicker')}</h2>
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
    </div>
  );
}
