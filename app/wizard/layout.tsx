import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getGuestUser } from '@/lib/guest';
import { redirectLocalized } from '@/lib/locale-redirect';
import { storedEntryPath } from '@/lib/stored-locale';
import { chromeTranslateOptOut, englishWizardNotranslateMeta } from '@/lib/chrome-translate';
import { cn, safeRedirectPath } from '@/lib/utils';
import { SkipLink } from '@/components/a11y/SkipLink';
import { ChatWidget } from '@/components/assistant/ChatWidget';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'wizard' });
  return {
    title: t('pageTitle'),
    robots: { index: false, follow: false },
    ...englishWizardNotranslateMeta(locale),
  };
}

/**
 * Wizard layout - admits both authenticated users AND guests holding a valid
 * `LF_GUEST_TOKEN` cookie. Anyone else is bounced to /sign-in.
 *
 * The dashboard chrome is intentionally omitted because guests don't have a
 * dashboard yet. The wizard renders its own header/progress UI inside
 * `WizardShell`.
 */
export default async function WizardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    const guest = await getGuestUser();
    if (!guest) {
      const next = safeRedirectPath(storedEntryPath());
      return await redirectLocalized(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in');
    }
  }

  const locale = await getLocale();
  const optOut = chromeTranslateOptOut(locale);

  return (
    <div className={cn('min-h-screen bg-surface', optOut.className)} translate={optOut.translate}>
      {/* Target the step content inside WizardShell so the skip link bypasses
          the sticky wizard header + progress bar, not just the page top. */}
      <SkipLink href="#wizard-step-content" />
      {children}
      <ChatWidget />
    </div>
  );
}
