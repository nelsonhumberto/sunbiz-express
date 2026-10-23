import { getLocale } from 'next-intl/server';
import { BUSINESS_LEGAL_NAME } from '@/lib/constants';

/** Names the contracting party once. Later sentences may keep the LaunchForma brand. */
export async function LegalEntityIntro() {
  const locale = await getLocale();
  if (locale === 'es') {
    return (
      <p>
        <strong>{BUSINESS_LEGAL_NAME}</strong> es una sociedad de responsabilidad limitada de
        Florida que opera como LaunchForma (&quot;LaunchForma&quot;, &quot;nosotros&quot;).
      </p>
    );
  }
  return (
    <p>
      <strong>{BUSINESS_LEGAL_NAME}</strong> is a Florida limited liability company
      doing business as LaunchForma (&quot;LaunchForma,&quot; &quot;we,&quot; &quot;us&quot;).
    </p>
  );
}
