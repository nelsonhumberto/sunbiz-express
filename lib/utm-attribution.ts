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
  const hasClick = Boolean(utm?.gclid || utm?.li_fat_id);
  if (!utm || (!hasCampaign && !hasClick)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { utmCampaign: true, utmSource: true, gclid: true, liFatId: true },
  });
  if (!user) return;

  if (!user.utmCampaign && !user.utmSource && hasCampaign) {
    const data = utmToPrismaFields(utm);
    if (user.gclid && !utm.gclid) data.gclid = user.gclid;
    if (user.liFatId && !utm.li_fat_id) data.liFatId = user.liFatId;
    await prisma.user.update({
      where: { id: userId },
      data,
    });
    return;
  }

  const clickIds: { gclid?: string; liFatId?: string } = {};
  if (!user.gclid && utm.gclid) clickIds.gclid = utm.gclid;
  if (!user.liFatId && utm.li_fat_id) clickIds.liFatId = utm.li_fat_id;
  if (Object.keys(clickIds).length === 0) return;

  await prisma.user.update({
    where: { id: userId },
    data: clickIds,
  });
}

/**
 * Backfill filing UTMs from the current cookie when the draft was created
 * without attribution (retarget campaigns hitting an existing session).
 */
export async function ensureFilingTouchUtm(filingId: string) {
  const utm = getServerUtmAttribution();
  const hasCampaign = Boolean(utm?.utm_campaign || utm?.utm_source);
  const hasClick = Boolean(utm?.gclid || utm?.li_fat_id);
  if (!utm || (!hasCampaign && !hasClick)) return;

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: { utmCampaign: true, utmSource: true, gclid: true, liFatId: true },
  });
  if (!filing) return;

  if (!filing.utmCampaign && !filing.utmSource && hasCampaign) {
    const data = utmToPrismaFields(utm);
    if (filing.gclid && !utm.gclid) data.gclid = filing.gclid;
    if (filing.liFatId && !utm.li_fat_id) data.liFatId = filing.liFatId;
    await prisma.filing.update({
      where: { id: filingId },
      data,
    });
    return;
  }

  const clickIds: { gclid?: string; liFatId?: string } = {};
  if (!filing.gclid && utm.gclid) clickIds.gclid = utm.gclid;
  if (!filing.liFatId && utm.li_fat_id) clickIds.liFatId = utm.li_fat_id;
  if (Object.keys(clickIds).length === 0) return;

  await prisma.filing.update({
    where: { id: filingId },
    data: clickIds,
  });
}
