'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_FORMATION_STATES, type StateCode } from '@/lib/formation-states';

export const PREFERRED_STATE_COOKIE = 'preferred_state';

/**
 * Persist the visitor's chosen formation state. Called by the marketing
 * `<StateSwitcher>` and by the wizard's start-filing flow when a state is
 * picked via query parameter.
 *
 * The cookie has no `httpOnly` flag so the client UI can read it back and
 * keep the switcher synced; it carries no auth value so this is safe.
 */
export async function setPreferredStateAction(state: string) {
  const upper = state.toUpperCase();
  if (!ACTIVE_FORMATION_STATES.includes(upper as StateCode)) {
    return { ok: false as const, error: 'Unsupported state.' };
  }
  cookies().set(PREFERRED_STATE_COOKIE, upper, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  // Clear any stale `geo_redirected` cookie so the next plain "/" request
  // is allowed to honor the freshly chosen preference cleanly.
  cookies().delete('geo_redirected');
  revalidatePath('/', 'layout');
  return { ok: true as const };
}
