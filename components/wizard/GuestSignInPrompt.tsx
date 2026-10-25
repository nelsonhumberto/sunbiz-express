'use client';

import { useLocale, useTranslations } from 'next-intl';
import { hrefForLocale } from '@/lib/app-href';
import { pickLocale } from '@/lib/pick-locale';
import { Button } from '@/components/ui/button';

/**
 * Sign-in prompt for a guest who typed an email that already has an account.
 * The draft stays on this browser until they sign in.
 */
export function GuestSignInPrompt({
  filingId,
  email,
  returnStep,
  filingLocale,
}: {
  filingId: string;
  email: string;
  returnStep: number;
  filingLocale?: string | null;
}) {
  const t = useTranslations('wizard');
  const locale = pickLocale(useLocale(), filingLocale);
  const returnPath = hrefForLocale(`/wizard/${filingId}/${returnStep}`, locale);
  const signInHref = hrefForLocale(
    `/sign-in?next=${encodeURIComponent(returnPath)}${
      email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ''
    }`,
    locale,
  );

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="text-ink-muted leading-relaxed">{t('accountGateSignIn')}</p>
      <Button asChild variant="outline" className="w-full">
        <a href={signInHref}>{t('accountGateSignInButton')}</a>
      </Button>
    </div>
  );
}
