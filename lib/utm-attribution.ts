import 'server-only';

import { prisma } from '@/lib/db';
import { getServerUtmAttribution } from '@/lib/utm-server';
import { utmToPrismaFields } from '@/lib/utm';

/** Prisma `data` fragment with current-request UTM fields, if any. */
export function filingUtmCreateFields() {
  return utmToPrismaFields(getServerUtmAttribution());
}

/** Prisma `data` fragment for first-touch user attribution on create. */
export function userUtmCreateFields() {
  return utmToPrismaFields(getServerUtmAttribution());
}

/**
 * Backfill first-touch UTMs on an existing user when they still have none
 * (e.g. guest created before attribution was wired, or returning visitor).
 */
export async function ensureUserFirstTouchUtm(userId: string) {
  const utm = getServerUtmAttribution();
  if (!utm?.utm_campaign && !utm?.utm_source) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { utmCampaign: true, utmSource: true },
  });
  if (!user || user.utmCampaign || user.utmSource) return;

  await prisma.user.update({
    where: { id: userId },
    data: utmToPrismaFields(utm),
  });
}

/**
 * Backfill filing UTMs from the current cookie when the draft was created
 * without attribution (retarget campaigns hitting an existing session).
 */
export async function ensureFilingTouchUtm(filingId: string) {
  const utm = getServerUtmAttribution();
  if (!utm?.utm_campaign && !utm?.utm_source) return;

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { utmCampaign: true, utmSource: true },
  });
  if (!filing || filing.utmCampaign || filing.utmSource) return;

  await prisma.filing.update({
    where: { id: filingId },
    data: utmToPrismaFields(utm),
  });
}
