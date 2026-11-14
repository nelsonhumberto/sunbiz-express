import { TIER_BY_SLUG, type TierSlug } from '@/lib/pricing';

const SLUGS = new Set<string>(['BASIC', 'STANDARD', 'PREMIUM']);

export function isTierSlug(value: string): value is TierSlug {
  return SLUGS.has(value);
}

/**
 * Customer-facing package name. Review must not print the stored slug
 * ("BASIC"); it prints Essential / Popular / Premium (or the locale string).
 */
/**
 * Order-summary package line. The stored label stays English for PDFs.
 * The tier word and the entity word follow the active locale.
 */
export function localizedPackageLabel(args: {
  storedLabel: string;
  tierSlug?: string | null;
  entityType: 'LLC' | 'CORP';
  translate: (key: string) => string;
  /** Spanish reads "Popular - Corporación de Florida". English keeps state first. */
  locale?: string | null;
}): string {
  const tierKey = args.tierSlug ? `tier_${args.tierSlug}` : '';
  const translatedTier = tierKey ? args.translate(tierKey) : '';
  const tierName =
    translatedTier && translatedTier !== tierKey
      ? translatedTier
      : (args.storedLabel.split(' - ')[0] ?? args.storedLabel);
  const dash = args.storedLabel.indexOf(' - ');
  const rest = dash === -1 ? '' : args.storedLabel.slice(dash + 3);
  const stateName = rest.replace(/ (LLC|Corporation)$/, '');
  const entityKey = args.entityType === 'CORP' ? 'packageEntityCorp' : 'packageEntityLlc';
  const translatedEntity = args.translate(entityKey);
  const entity =
    translatedEntity && translatedEntity !== entityKey
      ? translatedEntity
      : args.entityType === 'CORP'
        ? 'Corporation'
        : 'LLC';
  if (!stateName) return `${tierName} - ${entity}`;
  if (args.locale === 'es') return `${tierName} - ${entity} de ${stateName}`;
  return `${tierName} - ${stateName} ${entity}`;
}

export function serviceTierDisplayName(
  slug: string,
  translate?: (key: string) => string,
): string {
  if (!isTierSlug(slug)) return slug;
  if (translate) {
    const localized = translate(`tier_${slug}`);
    if (localized && localized !== `tier_${slug}`) return localized;
  }
  return TIER_BY_SLUG[slug].name;
}
