import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import {
  leaveMismatchedAccountForDraft,
  loadGuestDraftEmailMismatch,
} from '@/actions/guest-email';
import { redirectLocalized } from '@/lib/locale-redirect';

export const dynamic = 'force-dynamic';

/**
 * Shown when someone signs into an account that is not the email on the
 * guest draft. The draft is not attached. Continuing signs out of that
 * account and reopens the draft with the guest cookie.
 */
export default async function GuestDraftEmailMismatchPage({
  searchParams,
}: {
  searchParams: { filing?: string };
}) {
  const view = await loadGuestDraftEmailMismatch(searchParams.filing ?? '');
  if (!view) return await redirectLocalized('/dashboard');
  const t = await getTranslations({ locale: view.locale, namespace: 'wizard' });

  return (
    <main
      id="wizard-step-content"
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16"
    >
      <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
          {t('guestDraftEmailMismatch')}
        </h1>
        <form action={leaveMismatchedAccountForDraft}>
          <input type="hidden" name="filingId" value={view.filingId} />
          <input type="hidden" name="intent" value="guest" />
          <Button type="submit" className="w-full">
            {t('guestDraftContinue')}
          </Button>
        </form>
        <form action={leaveMismatchedAccountForDraft}>
          <input type="hidden" name="filingId" value={view.filingId} />
          <input type="hidden" name="intent" value="signin" />
          <Button type="submit" variant="outline" className="w-full">
            {t('guestDraftSignInEmail')}
          </Button>
        </form>
      </div>
    </main>
  );
}
