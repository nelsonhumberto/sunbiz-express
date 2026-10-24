import 'server-only';

import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import {
  OA_TEMPLATE_SOURCE,
  OA_TOKEN_PATTERN,
  hashOaToken,
  mintOaToken,
  oaConfirmExpiry,
  oaConfirmUrl,
  oaTemplateLinks,
  oaTemplateLocale,
  oaUnsubscribeSignatureValid,
  oaUnsubscribeUrl,
  type OaDownloadLink,
  type OaTemplateLocale,
} from '@/lib/oa-template';

export interface OaLeadSubmitInput {
  email: string;
  locale: OaTemplateLocale;
  consentText: string;
  ipHash: string;
  userAgent: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

function linkBy(
  links: OaDownloadLink[],
  variant: OaDownloadLink['variant'],
  format: OaDownloadLink['format'],
): string {
  const link = links.find((item) => item.variant === variant && item.format === format);
  if (!link) throw new Error(`Missing ${variant} ${format} link`);
  return link.url;
}

async function sendDownloadEmail(email: string, locale: OaTemplateLocale, leadId: string): Promise<boolean> {
  const links = oaTemplateLinks(locale);
  const sent = await sendEmail({
    type: 'OA_TEMPLATE_DOWNLOAD',
    to: email,
    context: {
      oaLocale: locale,
      oaSinglePdfUrl: linkBy(links, 'single', 'pdf'),
      oaSingleDocxUrl: linkBy(links, 'single', 'docx'),
      oaMultiPdfUrl: linkBy(links, 'multi', 'pdf'),
      oaMultiDocxUrl: linkBy(links, 'multi', 'docx'),
      oaUnsubscribeUrl: oaUnsubscribeUrl(leadId),
    },
  });
  if (sent.status !== 'SENT') {
    logger.error('oa template download email failed', {
      area: 'marketing',
      tag: 'oa-template-download-email',
      status: sent.status,
    });
    return false;
  }
  return true;
}

async function sendConfirmEmail(email: string, locale: OaTemplateLocale, leadId: string, token: string): Promise<boolean> {
  const sent = await sendEmail({
    type: 'OA_TEMPLATE_CONFIRM',
    to: email,
    context: {
      oaLocale: locale,
      oaConfirmUrl: oaConfirmUrl(token),
      oaUnsubscribeUrl: oaUnsubscribeUrl(leadId),
    },
  });
  if (sent.status !== 'SENT') {
    logger.error('oa template confirm email failed', {
      area: 'marketing',
      tag: 'oa-template-email',
      status: sent.status,
    });
    return false;
  }
  return true;
}

/**
 * Upsert the lead. A confirmed, still-subscribed address gets the download
 * links again. Anyone else gets a fresh 48-hour confirm token.
 * Callers return the same success message either way.
 */
export async function submitOaTemplateLead(input: OaLeadSubmitInput): Promise<boolean> {
  const existing = await prisma.lead.findUnique({
    where: { email_source: { email: input.email, source: OA_TEMPLATE_SOURCE } },
  });

  if (existing?.confirmedAt && !existing.unsubscribedAt) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        consent: true,
        consentText: input.consentText,
        consentAt: new Date(),
        locale: input.locale,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      },
    });
    return sendDownloadEmail(input.email, input.locale, existing.id);
  }

  const token = mintOaToken();
  const lead = await prisma.lead.upsert({
    where: { email_source: { email: input.email, source: OA_TEMPLATE_SOURCE } },
    create: {
      email: input.email,
      consent: true,
      consentText: input.consentText,
      consentAt: new Date(),
      locale: input.locale,
      source: OA_TEMPLATE_SOURCE,
      confirmTokenHash: hashOaToken(token),
      confirmTokenExpiresAt: oaConfirmExpiry(),
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
    },
    update: {
      consent: true,
      consentText: input.consentText,
      consentAt: new Date(),
      locale: input.locale,
      confirmTokenHash: hashOaToken(token),
      confirmTokenExpiresAt: oaConfirmExpiry(),
      confirmedAt: null,
      unsubscribedAt: null,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
    },
  });
  return sendConfirmEmail(input.email, input.locale, lead.id, token);
}

export type OaConfirmResult =
  | { status: 'confirmed'; locale: OaTemplateLocale; leadId: string }
  | { status: 'expired'; locale: OaTemplateLocale }
  | { status: 'invalid' };

export async function confirmOaTemplateLead(token: string): Promise<OaConfirmResult> {
  if (!OA_TOKEN_PATTERN.test(token)) return { status: 'invalid' };
  const hash = hashOaToken(token);
  const lead = await prisma.lead.findUnique({ where: { confirmTokenHash: hash } });
  if (!lead) return { status: 'invalid' };
  const locale = oaTemplateLocale(lead.locale);
  if (!lead.confirmTokenExpiresAt || lead.confirmTokenExpiresAt.getTime() <= Date.now()) {
    return { status: 'expired', locale };
  }

  const marked = await prisma.lead.updateMany({
    where: {
      id: lead.id,
      confirmTokenHash: hash,
      confirmedAt: null,
      confirmTokenExpiresAt: { gt: new Date() },
    },
    data: {
      confirmedAt: new Date(),
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      unsubscribedAt: null,
    },
  });
  if (marked.count !== 1) return { status: 'invalid' };

  const emailed = await sendDownloadEmail(lead.email, locale, lead.id);
  if (!emailed) {
    logger.error('oa template confirm stored without download email', {
      area: 'marketing',
      tag: 'oa-template-download-email',
    });
  }
  return { status: 'confirmed', locale, leadId: lead.id };
}

/** New confirm email for an expired token. Confirmed leads get the file links. */
export async function resendOaTemplateFromToken(token: string): Promise<boolean> {
  if (!OA_TOKEN_PATTERN.test(token)) return false;
  const lead = await prisma.lead.findUnique({ where: { confirmTokenHash: hashOaToken(token) } });
  if (!lead || lead.unsubscribedAt) return false;
  const locale = oaTemplateLocale(lead.locale);
  if (lead.confirmedAt) {
    return sendDownloadEmail(lead.email, locale, lead.id);
  }
  const next = mintOaToken();
  const previousHash = lead.confirmTokenHash;
  const previousExpiry = lead.confirmTokenExpiresAt;
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      confirmTokenHash: hashOaToken(next),
      confirmTokenExpiresAt: oaConfirmExpiry(),
    },
  });
  const sent = await sendConfirmEmail(lead.email, locale, lead.id, next);
  if (!sent) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { confirmTokenHash: previousHash, confirmTokenExpiresAt: previousExpiry },
    });
  }
  return sent;
}

export async function unsubscribeOaTemplateLead(
  leadId: string,
  sig: string,
): Promise<{ locale: OaTemplateLocale } | null> {
  if (!oaUnsubscribeSignatureValid(leadId, sig)) return null;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.source !== OA_TEMPLATE_SOURCE) return null;
  if (!lead.unsubscribedAt) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { unsubscribedAt: new Date() },
    });
  }
  return { locale: oaTemplateLocale(lead.locale) };
}

/** Confirmed lead that may see the static sample links. */
export async function confirmedOaLeadForSession(leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.source !== OA_TEMPLATE_SOURCE) return null;
  if (!lead.confirmedAt || lead.unsubscribedAt) return null;
  return { locale: oaTemplateLocale(lead.locale) };
}
