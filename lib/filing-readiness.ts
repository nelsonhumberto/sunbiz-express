import 'server-only';

import { prisma } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import { filingIncludesEin } from '@/lib/ein';
import type { AddOnSlug, TierSlug } from '@/lib/pricing';

interface RegisteredAgentLike {
  useOurService?: boolean;
  name?: string;
  street1?: string;
}
interface AddressLike {
  street1?: string;
  city?: string;
  zip?: string;
}

/**
 * Single source of truth for "is this filing complete enough to charge and
 * submit to the state?" Used by BOTH the wizard's processCheckout AND the
 * Stripe webhook backstop, so neither path can submit a half-finished draft
 * that would generate blank documents.
 *
 * Returns `{ ok: true }` or `{ ok: false, error }` with a human-readable
 * message naming the missing pieces.
 */
export async function assertFilingReadyForSubmission(
  filingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
    },
  });
  if (!filing) return { ok: false, error: 'Filing not found.' };

  // EIN gate: when the package includes an EIN, the responsible-party form
  // must be complete before we submit (Form SS-4 needs that data).
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  if (filingIncludesEin({ tier: filing.serviceTier as TierSlug, addOnSlugs })) {
    const ein = filing.einApplication;
    const completed =
      !!ein &&
      ['ready_online', 'manual_foreign', 'submitted', 'delivered'].includes(ein.status);
    if (!completed) {
      return { ok: false, error: 'EIN responsible-party details are required before checkout.' };
    }
  }

  const ra = safeParseJson<RegisteredAgentLike | null>(filing.registeredAgent, null);
  const principal = safeParseJson<AddressLike | null>(filing.principalAddress, null);
  const peopleCount = await prisma.managerMember.count({ where: { filingId: filing.id } });

  const missing: string[] = [];
  if (!filing.businessName?.trim()) missing.push('business name');
  if (!principal?.street1?.trim() || !principal?.city?.trim()) missing.push('principal address');
  const raOk = ra?.useOurService === true || (!!ra?.name?.trim() && !!ra?.street1?.trim());
  if (!raOk) missing.push('registered agent');
  if (!filing.incorporatorSignature?.trim()) missing.push('signature');
  if (peopleCount < 1) {
    missing.push(filing.entityType === 'CORP' ? 'directors/officers' : 'members');
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Please complete these required steps before payment: ${missing.join(', ')}.`,
    };
  }
  return { ok: true };
}
