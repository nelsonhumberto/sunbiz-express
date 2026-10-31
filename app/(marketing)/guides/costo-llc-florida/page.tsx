import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';
import { floridaLlcCostMetaValues, renderFloridaLlcCostMeta } from '@/lib/guide-meta';

const PATH = '/guides/costo-llc-florida';
const NS = 'guideLlcCosto';

export async function generateMetadata(): Promise<Metadata> {
  const meta = await spanishGuideMetadata(PATH, NS, {
    twinEnglishPath: '/guides/florida-llc-cost',
    indexable: true,
  });
  const t = await getTranslations(NS);
  const description = renderFloridaLlcCostMeta(t('metaDescription', floridaLlcCostMetaValues()));
  return {
    ...meta,
    description,
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
