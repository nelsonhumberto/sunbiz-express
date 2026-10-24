import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/licencia-negocio-broward';
const NS = 'guideBrowardBtr';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS);
}

export default function LicenciaNegocioBrowardPage() {
  return (
    <SpanishGuide
      path={PATH}
      namespace={NS}
      slug="licencia-negocio-broward"
      readingMinutes={7}
    />
  );
}
