import 'server-only';

import { prisma } from '@/lib/db';

/** Tester flag and mailbox for ad-conversion suppression. Lookup failure does not block the page. */
export async function adsActorForUser(
  userId: string | null | undefined,
  fallbackEmail?: string | null,
): Promise<{ isTester: boolean; email: string | null }> {
  const email = fallbackEmail?.trim() || null;
  if (!userId) return { isTester: false, email };
  try {
    const actor = await prisma.user.findUnique({
      where: { id: userId },
      select: { isTester: true, email: true },
    });
    return {
      isTester: actor?.isTester === true,
      email: actor?.email ?? email,
    };
  } catch {
    return { isTester: false, email };
  }
}
