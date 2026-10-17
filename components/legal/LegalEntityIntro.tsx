import { BUSINESS_LEGAL_NAME } from '@/lib/constants';

/** Names the contracting party once. Later sentences may keep the LaunchForma brand. */
export function LegalEntityIntro() {
  return (
    <p>
      <strong>{BUSINESS_LEGAL_NAME}</strong> is a Florida limited liability company
      doing business as LaunchForma (&quot;LaunchForma,&quot; &quot;we,&quot; &quot;us&quot;).
    </p>
  );
}
