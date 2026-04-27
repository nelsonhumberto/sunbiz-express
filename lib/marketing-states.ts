// Marketing-only state registry.
//
// IncServices currently files only in Florida. Other US states are surfaced
// as "coming soon" funnels: the marketing site shows a state-targeted hero
// and a waitlist instead of dragging a Georgia or Texas visitor into the
// Florida-specific filing wizard.
//
// This file is the single source of truth for:
//   - which states exist in our marketing world
//   - which are bookable today (`active`)
//   - which are accepting early-access leads (`coming_soon`)
//
// The actual legal filing rules still live in `lib/florida.ts` and friends —
// keep them out of this file so the wizard stays unmistakably Florida-only.

export type StateAvailability = 'active' | 'coming_soon';

export interface MarketingState {
  /** USPS two-letter code, uppercase. */
  code: string;
  /** English display name, e.g. "Florida". */
  name: string;
  /** Lowercase URL-safe slug, e.g. "florida". */
  slug: string;
  /** Spanish display name; usually identical but kept explicit. */
  nameEs: string;
  /** Whether the filing wizard supports this state today. */
  availability: StateAvailability;
}

const ALL_STATES: MarketingState[] = [
  { code: 'AL', name: 'Alabama', slug: 'alabama', nameEs: 'Alabama', availability: 'coming_soon' },
  { code: 'AK', name: 'Alaska', slug: 'alaska', nameEs: 'Alaska', availability: 'coming_soon' },
  { code: 'AZ', name: 'Arizona', slug: 'arizona', nameEs: 'Arizona', availability: 'coming_soon' },
  { code: 'AR', name: 'Arkansas', slug: 'arkansas', nameEs: 'Arkansas', availability: 'coming_soon' },
  { code: 'CA', name: 'California', slug: 'california', nameEs: 'California', availability: 'coming_soon' },
  { code: 'CO', name: 'Colorado', slug: 'colorado', nameEs: 'Colorado', availability: 'coming_soon' },
  { code: 'CT', name: 'Connecticut', slug: 'connecticut', nameEs: 'Connecticut', availability: 'coming_soon' },
  { code: 'DE', name: 'Delaware', slug: 'delaware', nameEs: 'Delaware', availability: 'coming_soon' },
  { code: 'DC', name: 'District of Columbia', slug: 'district-of-columbia', nameEs: 'Distrito de Columbia', availability: 'coming_soon' },
  { code: 'FL', name: 'Florida', slug: 'florida', nameEs: 'Florida', availability: 'active' },
  { code: 'GA', name: 'Georgia', slug: 'georgia', nameEs: 'Georgia', availability: 'coming_soon' },
  { code: 'HI', name: 'Hawaii', slug: 'hawaii', nameEs: 'Hawái', availability: 'coming_soon' },
  { code: 'ID', name: 'Idaho', slug: 'idaho', nameEs: 'Idaho', availability: 'coming_soon' },
  { code: 'IL', name: 'Illinois', slug: 'illinois', nameEs: 'Illinois', availability: 'coming_soon' },
  { code: 'IN', name: 'Indiana', slug: 'indiana', nameEs: 'Indiana', availability: 'coming_soon' },
  { code: 'IA', name: 'Iowa', slug: 'iowa', nameEs: 'Iowa', availability: 'coming_soon' },
  { code: 'KS', name: 'Kansas', slug: 'kansas', nameEs: 'Kansas', availability: 'coming_soon' },
  { code: 'KY', name: 'Kentucky', slug: 'kentucky', nameEs: 'Kentucky', availability: 'coming_soon' },
  { code: 'LA', name: 'Louisiana', slug: 'louisiana', nameEs: 'Luisiana', availability: 'coming_soon' },
  { code: 'ME', name: 'Maine', slug: 'maine', nameEs: 'Maine', availability: 'coming_soon' },
  { code: 'MD', name: 'Maryland', slug: 'maryland', nameEs: 'Maryland', availability: 'coming_soon' },
  { code: 'MA', name: 'Massachusetts', slug: 'massachusetts', nameEs: 'Massachusetts', availability: 'coming_soon' },
  { code: 'MI', name: 'Michigan', slug: 'michigan', nameEs: 'Michigan', availability: 'coming_soon' },
  { code: 'MN', name: 'Minnesota', slug: 'minnesota', nameEs: 'Minnesota', availability: 'coming_soon' },
  { code: 'MS', name: 'Mississippi', slug: 'mississippi', nameEs: 'Misisipi', availability: 'coming_soon' },
  { code: 'MO', name: 'Missouri', slug: 'missouri', nameEs: 'Misuri', availability: 'coming_soon' },
  { code: 'MT', name: 'Montana', slug: 'montana', nameEs: 'Montana', availability: 'coming_soon' },
  { code: 'NE', name: 'Nebraska', slug: 'nebraska', nameEs: 'Nebraska', availability: 'coming_soon' },
  { code: 'NV', name: 'Nevada', slug: 'nevada', nameEs: 'Nevada', availability: 'coming_soon' },
  { code: 'NH', name: 'New Hampshire', slug: 'new-hampshire', nameEs: 'Nuevo Hampshire', availability: 'coming_soon' },
  { code: 'NJ', name: 'New Jersey', slug: 'new-jersey', nameEs: 'Nueva Jersey', availability: 'coming_soon' },
  { code: 'NM', name: 'New Mexico', slug: 'new-mexico', nameEs: 'Nuevo México', availability: 'coming_soon' },
  { code: 'NY', name: 'New York', slug: 'new-york', nameEs: 'Nueva York', availability: 'coming_soon' },
  { code: 'NC', name: 'North Carolina', slug: 'north-carolina', nameEs: 'Carolina del Norte', availability: 'coming_soon' },
  { code: 'ND', name: 'North Dakota', slug: 'north-dakota', nameEs: 'Dakota del Norte', availability: 'coming_soon' },
  { code: 'OH', name: 'Ohio', slug: 'ohio', nameEs: 'Ohio', availability: 'coming_soon' },
  { code: 'OK', name: 'Oklahoma', slug: 'oklahoma', nameEs: 'Oklahoma', availability: 'coming_soon' },
  { code: 'OR', name: 'Oregon', slug: 'oregon', nameEs: 'Oregón', availability: 'coming_soon' },
  { code: 'PA', name: 'Pennsylvania', slug: 'pennsylvania', nameEs: 'Pensilvania', availability: 'coming_soon' },
  { code: 'RI', name: 'Rhode Island', slug: 'rhode-island', nameEs: 'Rhode Island', availability: 'coming_soon' },
  { code: 'SC', name: 'South Carolina', slug: 'south-carolina', nameEs: 'Carolina del Sur', availability: 'coming_soon' },
  { code: 'SD', name: 'South Dakota', slug: 'south-dakota', nameEs: 'Dakota del Sur', availability: 'coming_soon' },
  { code: 'TN', name: 'Tennessee', slug: 'tennessee', nameEs: 'Tennessee', availability: 'coming_soon' },
  { code: 'TX', name: 'Texas', slug: 'texas', nameEs: 'Texas', availability: 'coming_soon' },
  { code: 'UT', name: 'Utah', slug: 'utah', nameEs: 'Utah', availability: 'coming_soon' },
  { code: 'VT', name: 'Vermont', slug: 'vermont', nameEs: 'Vermont', availability: 'coming_soon' },
  { code: 'VA', name: 'Virginia', slug: 'virginia', nameEs: 'Virginia', availability: 'coming_soon' },
  { code: 'WA', name: 'Washington', slug: 'washington', nameEs: 'Washington', availability: 'coming_soon' },
  { code: 'WV', name: 'West Virginia', slug: 'west-virginia', nameEs: 'Virginia Occidental', availability: 'coming_soon' },
  { code: 'WI', name: 'Wisconsin', slug: 'wisconsin', nameEs: 'Wisconsin', availability: 'coming_soon' },
  { code: 'WY', name: 'Wyoming', slug: 'wyoming', nameEs: 'Wyoming', availability: 'coming_soon' },
];

export const ALL_MARKETING_STATES: readonly MarketingState[] = ALL_STATES;

export const FLORIDA: MarketingState = ALL_STATES.find((s) => s.code === 'FL')!;

const BY_CODE: Record<string, MarketingState> = Object.fromEntries(
  ALL_STATES.map((s) => [s.code, s]),
);

const BY_SLUG: Record<string, MarketingState> = Object.fromEntries(
  ALL_STATES.map((s) => [s.slug, s]),
);

const BY_NAME: Record<string, MarketingState> = Object.fromEntries(
  ALL_STATES.flatMap((s) => [
    [s.name.toLowerCase(), s],
    [s.nameEs.toLowerCase(), s],
  ]),
);

/**
 * Resolve a marketing state from a free-form input — typically `?state=GA`,
 * `?state=Georgia`, `?state=georgia`, or a route slug. Returns Florida if the
 * input is empty or unrecognised so the marketing site never breaks on
 * unexpected query strings.
 */
export function resolveMarketingState(input?: string | null): MarketingState {
  if (!input) return FLORIDA;
  const trimmed = input.trim();
  if (!trimmed) return FLORIDA;

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && BY_CODE[upper]) return BY_CODE[upper];

  const slugified = trimmed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z-]/g, '');
  if (BY_SLUG[slugified]) return BY_SLUG[slugified];

  const nameKey = trimmed.toLowerCase();
  if (BY_NAME[nameKey]) return BY_NAME[nameKey];

  return FLORIDA;
}

/** Convenience for callers that just need the boolean check. */
export function isStateActive(state: MarketingState): boolean {
  return state.availability === 'active';
}

/**
 * Pick the localized display name. Defaults to English; Spanish callers can
 * pass `'es'` to get the Spanish form (e.g. "Carolina del Norte").
 */
export function localizedStateName(state: MarketingState, locale: string): string {
  return locale === 'es' ? state.nameEs : state.name;
}
