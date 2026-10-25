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
  const hasCampaign = Boolean(utm?.utm_campaign || utm?.utm_source);
  const hasClick = Boolean(utm?.gclid);
  if (!utm || (!hasCampaign && !hasClick)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { utmCampaign: true, utmSource: true, gclid: true },
  });
  if (!user) return;

  if (!user.utmCampaign && !user.utmSource && hasCampaign) {
    const data = utmToPrismaFields(utm);
    if (user.gclid && !utm.gclid) data.gclid = user.gclid;
    await prisma.user.update({
      where: { id: userId },
      data,
    });
    return;
  }

  if (user.gclid || !utm.gclid) return;

  await prisma.user.update({
    where: { id: userId },
    data: { gclid: utm.gclid },
  });
}

/**
 * Backfill filing UTMs from the current cookie when the draft was created
 * without attribution (retarget campaigns hitting an existing session).
 */
export async function ensureFilingTouchUtm(filingId: string) {
  const utm = getServerUtmAttribution();
  const hasCampaign = Boolean(utm?.utm_campaign || utm?.utm_source);
  const hasClick = Boolean(utm?.gclid);
  if (!utm || (!hasCampaign && !hasClick)) return;

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { utmCampaign: true, utmSource: true, gclid: true },
  });
  if (!filing) return;

  if (!filing.utmCampaign && !filing.utmSource && hasCampaign) {
    const data = utmToPrismaFields(utm);
    if (filing.gclid && !utm.gclid) data.gclid = filing.gclid;
    await prisma.filing.update({
      where: { id: filingId },
      data,
    });
    return;
  }

  if (filing.gclid || !utm.gclid) return;

  await prisma.filing.update({
    where: { id: filingId },
    data: { gclid: utm.gclid },
  });
}
