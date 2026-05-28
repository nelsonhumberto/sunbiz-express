import 'server-only';

import { cookies } from 'next/headers';
import { UTM_COOKIE, parseUtmJson, type UtmData } from '@/lib/utm';

/** Read persisted ad attribution from the `lf_utm` cookie (server actions / RSC). */
export function getServerUtmAttribution(): UtmData | null {
  const raw = cookies().get(UTM_COOKIE)?.value;
  return parseUtmJson(raw);
}
