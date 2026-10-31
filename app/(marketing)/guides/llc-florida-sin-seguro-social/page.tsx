import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/llc-florida-sin-seguro-social';
const NS = 'guideLlcSinSsn';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS, {
    indexable: true,
    twinEnglishPath: '/guides/florida-llc-without-ssn',
  });
}

export default function LlcFloridaSinSeguroSocialPage() {
  return (
    <SpanishGuide
      path={PATH}
      namespace={NS}
      slug="llc-florida-sin-seguro-social"
      readingMinutes={6}
      showValue
      trackSource="/es/guides/llc-florida-sin-seguro-social"
    />
  );
}
