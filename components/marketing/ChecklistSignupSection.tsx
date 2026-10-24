import { ChecklistSignupForm } from '@/components/marketing/ChecklistSignupForm';
import { isSignupCaptureEnabled } from '@/lib/feature-flags';
import { checklistCopy } from '@/lib/drip-copy';
import { getLocale } from 'next-intl/server';

/**
 * Checklist opt-in. Renders nothing unless SIGNUP_CAPTURE_ENABLED is on.
 * The checkbox in the form starts unchecked.
 */
export async function ChecklistSignupSection() {
  if (!isSignupCaptureEnabled()) return null;

  const locale = await getLocale();
  const copy = checklistCopy(locale === 'en' ? 'en' : 'es');

  return (
    <section aria-labelledby="checklist-signup-heading" className="border-t border-border bg-muted/40">
      <div className="container py-12 md:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-8 md:grid-cols-2 md:items-center md:gap-12">
          <div>
            <h2
              id="checklist-signup-heading"
              className="font-display text-3xl font-medium leading-tight tracking-tight md:text-4xl"
            >
              {copy.headline}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-muted md:text-lg">{copy.subline}</p>
          </div>
          <ChecklistSignupForm />
        </div>
      </div>
    </section>
  );
}
