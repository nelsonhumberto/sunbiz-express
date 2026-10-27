import 'server-only';

import { getMarketingFaq } from '@/lib/marketing-faq';
import { resolveMarketingState } from '@/lib/marketing-states';
import { TIERS, tierPackagePriceCents, type EntityType, type TierSlug } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { FORMATION_STATES, type StateCode } from '@/lib/formation-states';
import { COMPANY_FACTS } from './docs';

function dollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

/**
 * Assemble the curated knowledge block injected into the system prompt. Pulls
 * from the same FAQ + pricing engine the site uses, so the assistant never
 * contradicts the marketing pages. Small corpus -> no vector DB needed.
 */
export function buildKnowledge(opts: {
  stateCode: StateCode;
  entityType: EntityType;
  locale: string;
}): string {
  const state = resolveMarketingState(opts.stateCode);
  const faq = getMarketingFaq(state, opts.locale)
    .map((f) => `Q: ${f.q}\nA: ${f.a}`)
    .join('\n\n');

  const pricing = TIERS.map((t) => {
    const price = dollars(
      tierPackagePriceCents(t.slug as TierSlug, opts.entityType, opts.stateCode),
    );
    const included = t.features
      .filter((feature) => feature.included)
      .map((feature) => feature.label)
      .join('; ');
    return `- ${t.name} (${t.slug}): ${price} all-in for a ${opts.entityType} in ${state.name}. Included: ${included}`;
  }).join('\n');

  const domainTiers = TIERS.filter((tier) =>
    tier.features.some((feature) => feature.included && /domain/i.test(feature.label)),
  ).map((tier) => tier.name);
  const withoutDomain = TIERS.filter((tier) => !domainTiers.includes(tier.name)).map(
    (tier) => tier.name,
  );
  const domainSentence =
    domainTiers.length > 0
      ? `A free .com domain (year 1) is included only with ${domainTiers.join(' and ')}. ${withoutDomain.join(' and ')} do not include a domain.`
      : '';

  const facts = COMPANY_FACTS.replaceAll(
    '{raRenewalPrice}',
    formatCurrency(FORMATION_STATES[opts.stateCode].registeredAgent.renewalCents),
  );

  return [
    facts,
    `\nCurrent package prices (${opts.entityType}, ${state.name}). Use the getPricing tool for exact line items + add-ons:\n${pricing}\n${domainSentence}`,
    `\nFrequently asked questions for ${state.name}:\n${faq}`,
  ].join('\n');
}
