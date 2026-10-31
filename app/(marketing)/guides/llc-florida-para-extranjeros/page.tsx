import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/llc-florida-para-extranjeros';
const NS = 'guideLlcExtranjeros';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS, {
    indexable: true,
    twinEnglishPath: '/guides/florida-llc-non-resident',
  });
}

export default function LlcFloridaParaExtranjerosPage() {
  return (
    <SpanishGuide
      path={PATH}
      namespace={NS}
      slug="llc-florida-para-extranjeros"
      readingMinutes={7}
      showValue
      trackSource="/es/guides/llc-florida-para-extranjeros"
    />
  );
}
