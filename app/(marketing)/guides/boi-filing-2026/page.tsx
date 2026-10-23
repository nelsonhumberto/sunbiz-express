import { headers } from 'next/headers';
import { permanentRedirect } from 'next/navigation';
import { isSpanishPublicPath, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';

// BOI reporting no longer applies to U.S.-formed companies (FinCEN final rule,
// August 2026). The current guidance lives on /boi-reporting.
export default function BoiGuideRedirect() {
  const publicPath = headers().get(PUBLIC_PATH_HEADER) ?? '';
  permanentRedirect(isSpanishPublicPath(publicPath) ? '/es/boi-reporting' : '/boi-reporting');
}
