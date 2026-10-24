import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/llc-o-negocio-individual-florida';
const NS = 'guideLlcVsSole';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS);
}

export default function LlcONegocioIndividualPage() {
  return (
    <SpanishGuide
      path={PATH}
      namespace={NS}
      slug="llc-o-negocio-individual-florida"
      readingMinutes={6}
    />
  );
}
