import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';
import { annualComplianceFor, FORMATION_STATES } from '@/lib/formation-states';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

const PATH = '/guides/costo-llc-florida';
const NS = 'guideLlcCosto';
const META_LIMIT = 160;

/**
 * Meta description for the Spanish cost guide. Dollars come from the same
 * Essential price and Florida fee figures as the page, not from literals.
 * If the filled sentence runs past 160 characters, the annual-report sentence drops.
 */
export function renderFloridaLlcCostMeta(template: string): string {
  const parts = tierPriceParts('BASIC', 'LLC', 'FL');
  const annualCents = annualComplianceFor(FORMATION_STATES.FL, 'LLC').baseFeeCents;
  const filled = template
    .replaceAll('{stateFee}', formatCurrency(parts.stateFeeCents))
    .replaceAll('{total}', formatCurrency(parts.totalCents))
    .replaceAll('{annual}', formatCurrency(annualCents));
  if (filled.length <= META_LIMIT) return filled;
  const sentences = filled.split('. ');
  if (sentences.length < 2) return filled;
  sentences.pop();
  return `${sentences.join('. ')}.`;
}

export async function generateMetadata(): Promise<Metadata> {
  const meta = await spanishGuideMetadata(PATH, NS, {
    twinEnglishPath: '/guides/florida-llc-cost',
    indexable: true,
  });
  const t = await getTranslations(NS);
  return {
    ...meta,
    description: renderFloridaLlcCostMeta(t('metaDescription')),
  };
}

export default function CostoLlcFloridaPage() {
  return (
    <SpanishGuide
      path={PATH}
      namespace={NS}
      slug="costo-llc-florida"
      readingMinutes={6}
      showValue
      trackSource="/es/guides/costo-llc-florida"
    />
  );
}
