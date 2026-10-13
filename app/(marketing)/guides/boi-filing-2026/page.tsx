import { permanentRedirect } from 'next/navigation';

// BOI reporting no longer applies to U.S.-formed companies (FinCEN final rule,
// August 2026). The current guidance lives on /boi-reporting.
export default function BoiGuideRedirect() {
  permanentRedirect('/boi-reporting');
}
