'use server';

import { z } from 'zod';
import { checklistConsentText, privacyPolicyUrl, type DripLocale } from '@/lib/drip-copy';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import { isSignupCaptureEnabled } from '@/lib/feature-flags';
import { savePendingChecklistLead } from '@/lib/checklist-lead';
import { isSignupHoneypot } from '@/lib/checklist-opt-in';
import { logger } from '@/lib/logger';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { getServerUtmAttribution } from '@/lib/utm-server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

const Input = z.object({
  email: z.string().trim().max(254),
  consent: z.boolean(),
  locale: z.enum(['en', 'es']).optional(),
  website: z.string().optional(),
  source: z.string().trim().max(64).optional(),
});

export type ChecklistSignupResult =
  | { ok: true }
  | { ok: false; error: 'disabled' | 'invalid-email' | 'consent-required' | 'generic' };

export async function captureChecklistSignup(
  input: z.input<typeof Input>,
): Promise<ChecklistSignupResult> {
  if (!isSignupCaptureEnabled()) return { ok: false, error: 'disabled' };

  if (isSignupHoneypot(input.website)) return { ok: true };

  const limited = checkActionRateLimit('checklist-signup', 8, 10 * 60 * 1000);
  if (limited) return { ok: false, error: 'generic' };

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((issue) => issue.path[0] === 'email');
    const consentIssue = parsed.error.issues.some((issue) => issue.path[0] === 'consent');
    if (consentIssue && !emailIssue) return { ok: false, error: 'consent-required' };
    return { ok: false, error: 'invalid-email' };
  }
  if (!parsed.data.consent) return { ok: false, error: 'consent-required' };
  if (!isDeliverableEmail(parsed.data.email)) return { ok: false, error: 'invalid-email' };

  const email = normalizeEmail(parsed.data.email);
  const locale: DripLocale = parsed.data.locale === 'en' ? 'en' : 'es';
  const consentText = checklistConsentText(locale, privacyPolicyUrl(locale, SITE_URL));

  try {
    await savePendingChecklistLead({
      email,
      locale,
      consentText,
      source: parsed.data.source,
      utm: getServerUtmAttribution(),
    });
  } catch (err) {
    logger.error('captureChecklistSignup failed', { area: 'marketing', tag: 'checklist-signup' }, err);
    return { ok: false, error: 'generic' };
  }

  return { ok: true };
}
