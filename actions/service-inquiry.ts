'use server';

import { z } from 'zod';
import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { checkActionRateLimit } from '@/lib/rate-limit';
import {
  SERVICE_INQUIRY_LABELS,
  SERVICE_INQUIRY_OPTIONS,
  type ServiceInquiryOption,
} from '@/lib/service-inquiry';
import { utmToPrismaFields } from '@/lib/utm';
import { getServerUtmAttribution } from '@/lib/utm-server';

const InquiryInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(32)
    .refine((value) => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15 && /^[0-9+\-().\s]+$/.test(value);
    }),
  service: z.enum(SERVICE_INQUIRY_OPTIONS),
  message: z.string().trim().max(2000).optional(),
  locale: z.enum(['en', 'es']).optional(),
  website: z.string().optional(),
});

export type SubmitServiceInquiryResult =
  | { ok: true; stored: boolean }
  | { ok: false; error: 'invalid' | 'generic' };

export async function submitServiceInquiry(
  input: z.input<typeof InquiryInput>,
): Promise<SubmitServiceInquiryResult> {
  if (input.website && input.website.trim().length > 0) {
    return { ok: true, stored: false };
  }

  const limited = checkActionRateLimit('service-inquiry', 5, 10 * 60 * 1000);
  if (limited) return { ok: false, error: 'generic' };

  const parsed = InquiryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const { name, email, phone, service, message, locale } = parsed.data;
  const utm = getServerUtmAttribution();
  const attribution = utmToPrismaFields(utm);
  const safeLocale = locale === 'es' ? 'es' : 'en';
  const note = message?.trim() ? message.trim() : null;

  try {
    await prisma.serviceInquiry.create({
      data: {
        name,
        email,
        phone,
        service,
        message: note,
        locale: safeLocale,
        ...attribution,
      },
    });
  } catch (err) {
    logger.error(
      'submitServiceInquiry failed',
      { area: 'marketing', tag: 'service-inquiry' },
      err,
    );
    return { ok: false, error: 'generic' };
  }

  try {
    await sendEmail({
      type: 'SERVICE_INQUIRY',
      to: INQUIRY_NOTIFY_EMAIL,
      context: {
        inquiryName: name,
        inquiryEmail: email,
        inquiryPhone: phone,
        inquiryService: SERVICE_INQUIRY_LABELS[service as ServiceInquiryOption],
        inquiryMessage: note ?? undefined,
        inquiryLocale: safeLocale,
        inquiryUtmSource: utm?.utm_source,
        inquiryUtmMedium: utm?.utm_medium,
        inquiryUtmCampaign: utm?.utm_campaign,
        inquiryUtmContent: utm?.utm_content,
        inquiryUtmTerm: utm?.utm_term,
        inquiryGclid: utm?.gclid,
        inquiryLiFatId: utm?.li_fat_id,
      },
    });
  } catch (err) {
    logger.error(
      'service inquiry email failed',
      { area: 'marketing', tag: 'service-inquiry-email' },
      err,
    );
  }

  return { ok: true, stored: true };
}
