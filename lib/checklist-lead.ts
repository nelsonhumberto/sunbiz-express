import 'server-only';

import { prisma } from '@/lib/db';
import type { DripLocale } from '@/lib/drip-copy';
import { normalizeEmail } from '@/lib/email-address';
import { sendEmail } from '@/lib/email';
import { isRecordedEmailStatus } from '@/lib/email-status';
import { logger } from '@/lib/logger';
import { unsubscribeLink, unsubscribeSigningSecret } from '@/lib/unsubscribe';
import {
  checklistConfirmExpiry,
  checklistConfirmPlan,
  checklistConfirmUrl,
  hashChecklistToken,
  isChecklistTestAddress,
  readChecklistConfirmToken,
  signChecklistConfirmToken,
} from '@/lib/checklist-opt-in';
import type { UtmData } from '@/lib/utm';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

function asLocale(value: string | null | undefined): DripLocale {
  return value === 'en' ? 'en' : 'es';
}

async function unsubscribedAfterConsent(email: string, consentAt: Date): Promise<boolean> {
  const row = await prisma.marketingOptOut.findUnique({ where: { email } });
  if (!row) return false;
  return row.updatedAt.getTime() > consentAt.getTime();
}

async function deliverChecklist(lead: {
  id: string;
  email: string;
  locale: string;
}): Promise<boolean> {
  // One confirm click wins. A second click in the same moment sees the
  // timestamp and does not send another checklist.
  const claimedAt = new Date();
  const claimed = await prisma.checklistSignup.updateMany({
    where: { id: lead.id, checklistSentAt: null },
    data: { checklistSentAt: claimedAt, confirmedAt: claimedAt },
  });
  if (claimed.count !== 1) return true;

  try {
    const user = await prisma.user.findUnique({
      where: { email: lead.email },
      select: { id: true, firstName: true },
    });
    const locale = asLocale(lead.locale);
    const unsubscribeUrl = unsubscribeLink(SITE_URL, lead.email, undefined, locale);
    const sent = await sendEmail({
      type: 'CHECKLIST_DELIVERY',
      to: lead.email,
      userId: user?.id,
      listUnsubscribeUrl: unsubscribeUrl,
      context: {
        firstName: user?.firstName,
        locale,
        unsubscribeUrl,
      },
    });
    if (!isRecordedEmailStatus(sent.status)) {
      await prisma.checklistSignup.updateMany({
        where: { id: lead.id, checklistSentAt: claimedAt },
        data: { checklistSentAt: null },
      });
      return false;
    }
    return true;
  } catch (error) {
    await prisma.checklistSignup.updateMany({
      where: { id: lead.id, checklistSentAt: claimedAt },
      data: { checklistSentAt: null },
    });
    throw error;
  }
}

/**
 * Store a pending checklist lead and send the confirm link.
 * A person who already confirmed and still wants mail is not emailed again.
 */
export async function savePendingChecklistLead(input: {
  email: string;
  locale: DripLocale;
  consentText: string;
  now?: Date;
  source?: string | null;
  utm?: UtmData | null;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  const existing = await prisma.checklistSignup.findUnique({ where: { email } });

  if (existing?.confirmedAt && existing.checklistSentAt) {
    const blocked = await unsubscribedAfterConsent(email, existing.consentAt);
    if (!blocked) return;
  }
  if (existing?.confirmedAt && !existing.checklistSentAt) {
    const blocked = await unsubscribedAfterConsent(email, existing.consentAt);
    if (!blocked) {
      await deliverChecklist(existing);
      return;
    }
  }

  const expires = checklistConfirmExpiry(now.getTime());
  const token = signChecklistConfirmToken(email, expires.getTime(), unsubscribeSigningSecret());
  const campaign = {
    source: input.source?.slice(0, 64) || null,
    utmSource: input.utm?.utm_source ?? null,
    utmMedium: input.utm?.utm_medium ?? null,
    utmCampaign: input.utm?.utm_campaign ?? null,
    utmContent: input.utm?.utm_content ?? null,
    utmTerm: input.utm?.utm_term ?? null,
    gclid: input.utm?.gclid ?? null,
  };
  await prisma.checklistSignup.upsert({
    where: { email },
    create: {
      email,
      locale: input.locale,
      consent: true,
      consentAt: now,
      consentText: input.consentText,
      isTest: isChecklistTestAddress(email),
      confirmTokenHash: hashChecklistToken(token),
      confirmTokenExpiresAt: expires,
      ...campaign,
    },
    update: {
      locale: input.locale,
      consent: true,
      consentAt: now,
      consentText: input.consentText,
      isTest: isChecklistTestAddress(email),
      confirmTokenHash: hashChecklistToken(token),
      confirmTokenExpiresAt: expires,
      confirmedAt: null,
      checklistSentAt: null,
      ...campaign,
    },
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true },
  });
  const unsubscribeUrl = unsubscribeLink(SITE_URL, email, undefined, input.locale);
  const sent = await sendEmail({
    type: 'CHECKLIST_CONFIRM',
    to: email,
    userId: user?.id,
    listUnsubscribeUrl: unsubscribeUrl,
    context: {
      firstName: user?.firstName,
      locale: input.locale,
      unsubscribeUrl,
      checklistConfirmUrl: checklistConfirmUrl(token, SITE_URL),
    },
  });
  if (!isRecordedEmailStatus(sent.status)) {
    logger.error('checklist confirm email failed', {
      area: 'marketing',
      tag: 'checklist-confirm',
      status: sent.status,
    });
  }
}

export type ChecklistConfirmOutcome =
  | { status: 'confirmed' | 'already'; locale: DripLocale }
  | { status: 'expired' | 'invalid' | 'unsubscribed'; locale: DripLocale | null };

export async function confirmChecklistToken(
  token: string,
  now = new Date(),
): Promise<ChecklistConfirmOutcome> {
  const read = readChecklistConfirmToken(token, now.getTime());
  const hash = hashChecklistToken(token);
  const lead = await prisma.checklistSignup.findUnique({ where: { confirmTokenHash: hash } });
  if (!lead) return { status: 'invalid', locale: null };

  const locale = asLocale(lead.locale);
  const plan = checklistConfirmPlan({
    tokenStatus: read.ok ? 'valid' : read.reason,
    hashMatches: read.ok ? read.email === lead.email : true,
    unsubscribedAfterConsent: await unsubscribedAfterConsent(lead.email, lead.consentAt),
    checklistSent: Boolean(lead.checklistSentAt),
  });

  if (plan === 'already') return { status: 'already', locale };
  if (plan === 'expired') return { status: 'expired', locale };
  if (plan === 'unsubscribed') return { status: 'unsubscribed', locale };
  if (plan !== 'deliver') return { status: 'invalid', locale };

  if (!read.ok || read.email !== lead.email) return { status: 'invalid', locale };

  await prisma.$transaction([
    prisma.checklistSignup.update({
      where: { id: lead.id },
      data: { confirmedAt: lead.confirmedAt ?? now },
    }),
    prisma.marketingOptOut.deleteMany({ where: { email: lead.email } }),
  ]);

  const delivered = await deliverChecklist(lead);
  if (!delivered) {
    logger.error('checklist confirmed without delivery', {
      area: 'marketing',
      tag: 'checklist-delivery',
    });
  }
  return { status: 'confirmed', locale };
}
