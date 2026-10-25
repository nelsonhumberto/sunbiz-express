import 'server-only';

import { headers } from 'next/headers';
import { INTERNAL_TRAFFIC_HEADER, signInHrefPreservingInternal } from '@/lib/internal-traffic';
import { redirectLocalized } from '@/lib/locale-redirect';

/** Send a signed-out visitor to sign-in, keeping `?lf_internal=1` when they arrived with it. */
export async function redirectToSignIn(): Promise<never> {
  const requested = headers().get(INTERNAL_TRAFFIC_HEADER) === '1';
  return await redirectLocalized(signInHrefPreservingInternal(requested));
}
