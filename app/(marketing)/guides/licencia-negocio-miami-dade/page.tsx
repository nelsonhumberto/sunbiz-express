import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/licencia-negocio-miami-dade';
const NS = 'guideMiamiBtr';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS);
}

export default function LicenciaNegocioMiamiDadePage() {
  return (
    <SpanishGuide
      path={PATH}
      namespace={NS}
      slug="licencia-negocio-miami-dade"
      readingMinutes={7}
    />
  );
}
