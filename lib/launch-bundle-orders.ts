import 'server-only';

import { prisma } from '@/lib/db';
import { ADD_ON_BY_SLUG, launchBundleCostBreakdown, type AddOnSlug } from '@/lib/pricing';
import {
  LAUNCH_BUNDLE_ADD_ON_SLUGS,
  LAUNCH_BUNDLE_ADVISORY_LOCK,
  paidLaunchBundleWhere,
} from '@/lib/launch-bundle';

/**
 * Paid non-test bundle filings. The advisory lock serializes the read so two
 * payment-intent requests do not both observe a stale count. The cap is
 * rechecked here, at intent creation, before Stripe is called.
 */
export async function countPaidLaunchBundleOrders(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LAUNCH_BUNDLE_ADVISORY_LOCK})`;
    return tx.filing.count({ where: paidLaunchBundleWhere });
  });
}

/** Snapshot the $299 total onto the filing. Catalog prices stay untouched. */
export async function writeLaunchBundleTotals(filingId: string): Promise<void> {
  const quote = launchBundleCostBreakdown();
  await prisma.filing.update({
    where: { id: filingId },
    data: {
      stateFeeCents: quote.governmentRemittanceCents,
      serviceFeeCents: quote.packageMarginCents,
      addOnsTotalCents: quote.addOnsCents,
      totalCents: quote.totalCents,
    },
  });
}

/**
 * Lock Essential's included services onto the filing: free year-1 registered
 * agent, EIN, and the single-member Operating Agreement. Extra paid add-ons
 * are removed so the charge stays $299.
 */
export async function ensureLaunchBundleAddOns(filingId: string): Promise<void> {
  const wanted = new Set<string>(LAUNCH_BUNDLE_ADD_ON_SLUGS);

  for (const slug of LAUNCH_BUNDLE_ADD_ON_SLUGS) {
    const def = ADD_ON_BY_SLUG[slug as AddOnSlug];
    const service = await prisma.additionalService.upsert({
      where: { serviceSlug: slug },
      update: {},
      create: {
        serviceName: def.name,
        serviceSlug: slug,
        description: def.description,
        iconKey: def.iconKey,
        priceCents: def.priceCents,
        category: def.category,
      },
    });
    await prisma.filingAdditionalService.upsert({
      where: { filingId_serviceId: { filingId, serviceId: service.id } },
      update: { status: 'PENDING' },
      create: {
        filingId,
        serviceId: service.id,
        quantity: 1,
        priceCents: def.priceCents,
        status: 'PENDING',
      },
    });
  }

  await prisma.filingAdditionalService.deleteMany({
    where: {
      filingId,
      service: { serviceSlug: { notIn: [...wanted] } },
    },
  });
}
