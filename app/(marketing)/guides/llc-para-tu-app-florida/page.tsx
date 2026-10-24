import type { Metadata } from 'next';
import { SpanishGuide, spanishGuideMetadata } from '@/components/marketing/SpanishGuide';

const PATH = '/guides/llc-para-tu-app-florida';
const NS = 'guideLlcApp';

export function generateMetadata(): Promise<Metadata> {
  return spanishGuideMetadata(PATH, NS);
}

export default function LlcParaTuAppPage() {
  return (
    <SpanishGuide path={PATH} namespace={NS} slug="llc-para-tu-app-florida" readingMinutes={6} />
  );
}
