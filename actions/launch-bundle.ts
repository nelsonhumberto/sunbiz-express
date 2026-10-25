'use server';

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { newGuestToken, setGuestCookie, getGuestUser } from '@/lib/guest';
import { logger } from '@/lib/logger';
import { isRedirectError } from '@/lib/action-timeout';
import { PREFERRED_STATE_COOKIE } from '@/lib/constants';
import { cookies } from 'next/headers';
import {
  filingUtmCreateFields,
  userUtmCreateFields,
  ensureUserFirstTouchUtm,
} from '@/lib/utm-attribution';
import { storedEntryPath, storedLocale } from '@/lib/stored-locale';
import { redirectLocalized } from '@/lib/locale-redirect';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { launchBundleCostBreakdown, LAUNCH_BUNDLE_SOURCE } from '@/lib/pricing';
import { placeholderGuestEmail } from '@/lib/guest-identity';
import {
  launchBundleOptionalDetails,
  launchBundlePaymentAllowed,
  mergeReferralRef,
  normalizeReferralRef,
} from '@/lib/launch-bundle';
import {
  countPaidLaunchBundleOrders,
  ensureLaunchBundleAddOns,
  writeLaunchBundleTotals,
} from '@/lib/launch-bundle-orders';

function bundleReturnPath(ref: string | null, error?: string): string {
  const params = new URLSearchParams();
  if (ref) params.set('ref', ref);
  if (error) params.set('error', error);
  const qs = params.toString();
  return `/launch-bundle${qs ? `?${qs}` : ''}`;
}

/**
 * Start the normal wizard with the launch bundle preselected.
 * Called only from the direct-link landing page. Refuses a new draft once
 * 10 non-test orders are paid. An in-progress bundle draft can still be resumed.
 */
export async function startLaunchBundle(formData: FormData): Promise<void> {
  const ref = normalizeReferralRef(typeof formData.get('ref') === 'string' ? String(formData.get('ref')) : null);
  const locale = await storedLocale();
  const localeData = locale ? { locale } : {};
  const entryPath = storedEntryPath();
  const entryData = entryPath ? { entryPath } : {};

  let paid = 0;
  try {
    paid = await countPaidLaunchBundleOrders();
  } catch (err) {
    logger.error('launch bundle cap check failed', { area: 'checkout', tag: 'launch-bundle-cap' }, err);
    return redirectLocalized(bundleReturnPath(ref, 'start'), locale);
  }
  const open = launchBundlePaymentAllowed(paid);

  const session = await auth();
  const guest = session?.user?.id ? null : await getGuestUser();
  const userId = session?.user?.id ?? guest?.id ?? null;

  if (userId) {
    const draft = await prisma.filing.findFirst({
      where: { userId, status: 'DRAFT', filingSource: LAUNCH_BUNDLE_SOURCE },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, currentStep: true, optionalDetails: true },
    });
    if (draft) {
      await prisma.filing.update({
        where: { id: draft.id },
        data: { optionalDetails: mergeReferralRef(draft.optionalDetails, ref) },
      });
      await ensureLaunchBundleAddOns(draft.id);
      await writeLaunchBundleTotals(draft.id);
      const step = draft.currentStep && draft.currentStep >= 1 ? draft.currentStep : 1;
      return redirectLocalized(`/wizard/${draft.id}/${step}`, locale);
    }
  }

  if (!open) {
    return redirectLocalized(bundleReturnPath(ref), locale);
  }

  if (!userId) {
    const limited = checkActionRateLimit('launch-bundle-open', 30, 60 * 60 * 1000);
    if (limited) return redirectLocalized(bundleReturnPath(ref, 'start'), locale);
  }

  const quote = launchBundleCostBreakdown();
  let filingId = '';
  try {
    let ownerId = userId;
    if (!ownerId) {
      const token = newGuestToken();
      const placeholderPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const created = await prisma.user.create({
        data: {
          email: placeholderGuestEmail(token),
          firstName: '',
          lastName: '',
          passwordHash: placeholderPassword,
          accountStatus: 'GUEST',
          guestToken: token,
          ...localeData,
          ...userUtmCreateFields(),
        },
      });
      ownerId = created.id;
      setGuestCookie(token);
    } else if (!session?.user?.id) {
      await ensureUserFirstTouchUtm(ownerId);
    }

    cookies().set(PREFERRED_STATE_COOKIE, 'FL', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });

    const filing = await prisma.filing.create({
      data: {
        userId: ownerId,
        entityType: 'LLC',
        taxElection: null,
        state: 'FL',
        serviceTier: 'BASIC',
        filingSource: LAUNCH_BUNDLE_SOURCE,
        currentStep: 1,
        completedSteps: '[]',
        optionalDetails: launchBundleOptionalDetails(ref),
        stateFeeCents: quote.governmentRemittanceCents,
        serviceFeeCents: quote.packageMarginCents,
        addOnsTotalCents: quote.addOnsCents,
        totalCents: quote.totalCents,
        ...localeData,
        ...entryData,
        ...filingUtmCreateFields(),
      },
    });
    filingId = filing.id;
    await ensureLaunchBundleAddOns(filing.id);
    await writeLaunchBundleTotals(filing.id);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    logger.error('launch bundle start failed', { area: 'guest', tag: 'launch-bundle' }, err);
    return redirectLocalized(bundleReturnPath(ref, 'start'), locale);
  }

  return redirectLocalized(`/wizard/${filingId}/1`, locale);
}
