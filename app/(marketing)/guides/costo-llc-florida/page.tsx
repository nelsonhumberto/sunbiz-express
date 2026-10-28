import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/costo-llc-florida';
const NS = 'guideLlcCosto';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS, {
    twinEnglishPath: '/guides/florida-llc-cost',
    indexable: true,
  });
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
