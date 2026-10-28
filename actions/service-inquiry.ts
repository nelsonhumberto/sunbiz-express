'use server';

import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { checkActionRateLimit } from '@/lib/rate-limit';
import {
  inquiryCompanyFieldValues,
  inquiryStoredMessage,
  SERVICE_INQUIRY_LABELS,
  serviceInquirySubjectPrefix,
} from '@/lib/service-inquiry-note';
import { ServiceInquirySchema, inquiryHoneypotTripped } from '@/lib/service-inquiry';
import { utmToPrismaFields } from '@/lib/utm';
import { getServerUtmAttribution } from '@/lib/utm-server';

export type SubmitServiceInquiryResult =
  | { ok: true; stored: boolean }
  | { ok: false; error: 'invalid' | 'generic' };

export async function submitServiceInquiry(
  input: unknown,
): Promise<SubmitServiceInquiryResult> {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (
    inquiryHoneypotTripped({
      lf_hp: typeof raw.lf_hp === 'string' ? raw.lf_hp : '',
      website: typeof raw.website === 'string' ? raw.website : '',
    })
  ) {
    return { ok: true, stored: false };
  }

  const limited = checkActionRateLimit('service-inquiry', 5, 10 * 60 * 1000);
  if (limited) return { ok: false, error: 'generic' };

  const parsed = ServiceInquirySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const { name, phone, service, message, locale, documentNumber, companyName } = parsed.data;
  const email = parsed.data.email?.trim() ? parsed.data.email.trim().toLowerCase() : null;
  const utm = getServerUtmAttribution();
  const attribution = utmToPrismaFields(utm);
  const safeLocale = locale === 'es' ? 'es' : 'en';
  const visitorMessage = message?.trim() ? message.trim() : null;
  const note = inquiryStoredMessage({
    service,
    message: visitorMessage,
    documentNumber,
    companyName,
  });
  const companyFields = inquiryCompanyFieldValues({ service, documentNumber, companyName });

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
        inquiryEmail: email ?? undefined,
        inquiryPhone: phone,
        inquiryService: SERVICE_INQUIRY_LABELS[service],
        inquirySubjectPrefix: serviceInquirySubjectPrefix(service),
        inquirySunbizDocumentNumber: companyFields.documentNumber,
        inquiryCompanyName: companyFields.companyName,
        inquiryMessage: visitorMessage ?? undefined,
        inquiryLocale: safeLocale,
        inquiryUtmSource: utm?.utm_source,
        inquiryUtmMedium: utm?.utm_medium,
        inquiryUtmCampaign: utm?.utm_campaign,
        inquiryUtmContent: utm?.utm_content,
        inquiryUtmTerm: utm?.utm_term,
        inquiryGclid: utm?.gclid,
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
