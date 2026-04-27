'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const ArchiveDraftSchema = z.object({
  filingId: z.string().min(1),
});

/**
 * Hide a draft filing from the customer's dashboard.
 *
 * The row remains in the database (with `userArchivedAt` populated) so that
 * admins can still see who started a filing and where they dropped off —
 * critical for retention outreach and conversion analytics. We deliberately
 * do NOT delete here:
 *   - non-DRAFT filings are protected (already filed = important data)
 *   - we never accept a customer-supplied "purge" flag
 */
export async function archiveDraft(input: z.infer<typeof ArchiveDraftSchema>) {
  const data = ArchiveDraftSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Not signed in.' };
  }

  const filing = await prisma.filing.findUnique({
    where: { id: data.filingId },
    select: { id: true, userId: true, status: true },
  });
  if (!filing || filing.userId !== session.user.id) {
    return { ok: false as const, error: 'Filing not found.' };
  }
  if (filing.status !== 'DRAFT') {
    return {
      ok: false as const,
      error: 'Only drafts can be removed from your dashboard.',
    };
  }

  await prisma.filing.update({
    where: { id: filing.id },
    data: { userArchivedAt: new Date() },
  });

  revalidatePath('/dashboard');
  return { ok: true as const };
}

const RestoreDraftSchema = z.object({
  filingId: z.string().min(1),
});

/**
 * Re-surface a previously archived draft on the customer's dashboard. Useful
 * if they archived in error and want to resume.
 */
export async function restoreDraft(input: z.infer<typeof RestoreDraftSchema>) {
  const data = RestoreDraftSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Not signed in.' };
  }

  const filing = await prisma.filing.findUnique({
    where: { id: data.filingId },
    select: { id: true, userId: true, status: true },
  });
  if (!filing || filing.userId !== session.user.id) {
    return { ok: false as const, error: 'Filing not found.' };
  }

  await prisma.filing.update({
    where: { id: filing.id },
    data: { userArchivedAt: null },
  });

  revalidatePath('/dashboard');
  return { ok: true as const };
}
