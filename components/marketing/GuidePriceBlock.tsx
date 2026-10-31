import { getTranslations } from 'next-intl/server';
import { feeSplitLabel } from '@/components/marketing/fee-split';
import { FORMATION_STATES } from '@/lib/formation-states';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

/** Essential Florida LLC price. Amounts come from the pricing catalog. */
export async function GuidePriceBlock() {
  const t = await getTranslations('pricing');
  const parts = tierPriceParts('BASIC', 'LLC', 'FL');
  const split = feeSplitLabel(
    (key, values) => t(key as 'feeSplit', values),
    parts,
    FORMATION_STATES.FL.name,
    'BASIC',
  );
  return (
    <aside
      data-testid="guide-value"
      className="not-prose my-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <p className="font-display text-2xl font-medium text-ink">
        {formatCurrency(parts.totalCents)} {t('allIn')}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{split}</p>
      <p className="mt-1 text-sm font-medium text-ink">{t('feat_sameDay')}</p>
    </aside>
  );
}
