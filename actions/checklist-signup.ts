'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import { sendEmail } from '@/lib/email';
import { checklistConsentText, privacyPolicyUrl, type DripLocale } from '@/lib/drip-copy';
import { isSignupCaptureEnabled } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { unsubscribeLink } from '@/lib/unsubscribe';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

const Input = z.object({
  email: z.string().trim().max(254),
  consent: z.boolean(),
  locale: z.enum(['en', 'es']).optional(),
  website: z.string().optional(),
});

export type ChecklistSignupResult =
  | { ok: true }
  | { ok: false; error: 'disabled' | 'invalid-email' | 'consent-required' | 'generic' };

export async function captureChecklistSignup(
  input: z.input<typeof Input>,
): Promise<ChecklistSignupResult> {
  if (!isSignupCaptureEnabled()) return { ok: false, error: 'disabled' };

  if (input.website && input.website.trim().length > 0) {
    return { ok: true };
  }

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
  const consentAt = new Date();
  const consentText = checklistConsentText(locale, privacyPolicyUrl(locale, SITE_URL));

  try {
    await prisma.$transaction([
      prisma.marketingOptOut.deleteMany({ where: { email } }),
      prisma.checklistSignup.upsert({
        where: { email },
        create: { email, locale, consent: true, consentAt, consentText },
        update: { locale, consent: true, consentAt, consentText },
      }),
    ]);
  } catch (err) {
    logger.error('captureChecklistSignup failed', { area: 'marketing', tag: 'checklist-signup' }, err);
    return { ok: false, error: 'generic' };
  }

  try {
    const alreadySent = await prisma.emailNotification.findFirst({
      where: {
        recipientEmail: email,
        notificationType: 'CHECKLIST_DELIVERY',
        status: 'SENT',
      },
      select: { id: true },
    });
    if (!alreadySent) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true },
      });
      const unsubscribeUrl = unsubscribeLink(SITE_URL, email);
      await sendEmail({
        type: 'CHECKLIST_DELIVERY',
        to: email,
        userId: user?.id,
        listUnsubscribeUrl: unsubscribeUrl,
        context: {
          firstName: user?.firstName,
          locale,
          unsubscribeUrl,
        },
      });
    }
  } catch (err) {
    logger.error('checklist delivery failed', { area: 'marketing', tag: 'checklist-signup' }, err);
  }

  return { ok: true };
}
