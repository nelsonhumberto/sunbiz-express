/**
 * Notify IndexNow (Bing, Yandex, and others) that URLs changed.
 *
 *   npm run indexnow
 *   npm run indexnow -- https://launchforma.com/es/guides/llc-para-tu-app-florida
 *
 * The key file is public/<32 hex chars>.txt. Its body is the key.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_HOST = 'launchforma.com';

export const INDEXNOW_URLS = [
  'https://launchforma.com/es/guides/costo-llc-florida',
  'https://launchforma.com/es/guides/llc-florida-sin-seguro-social',
  'https://launchforma.com/es/guides/llc-florida-para-extranjeros',
  'https://launchforma.com/es/guides/licencia-negocio-miami-dade',
  'https://launchforma.com/es/guides/licencia-negocio-broward',
  'https://launchforma.com/es/guides/llc-o-negocio-individual-florida',
  'https://launchforma.com/es/guides/llc-para-tu-app-florida',
];

export function indexNowKeyFromPublic(publicDir = join(process.cwd(), 'public')) {
  const files = readdirSync(publicDir).filter((name) => /^[a-f0-9]{32}\.txt$/.test(name));
  if (files.length !== 1) {
    throw new Error(`Expected one IndexNow key file in ${publicDir}, found ${files.length}`);
  }
  const filename = files[0];
  const key = filename.slice(0, -4);
  const body = readFileSync(join(publicDir, filename), 'utf8').trim();
  if (body !== key) {
    throw new Error('IndexNow key file body does not match its filename');
  }
  return { key, filename };
}

export function indexNowPayload(key, urlList) {
  return {
    host: INDEXNOW_HOST,
    key,
    keyLocation: `https://${INDEXNOW_HOST}/${key}.txt`,
    urlList,
  };
}

export async function notifyIndexNow(urlList = INDEXNOW_URLS, fetchImpl = fetch) {
  const { key } = indexNowKeyFromPublic();
  const payload = indexNowPayload(key, urlList);
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`IndexNow responded ${response.status}: ${detail.slice(0, 500)}`);
  }
  return { status: response.status, count: urlList.length, keyLocation: payload.keyLocation };
}

async function main() {
  const extra = process.argv.slice(2).filter((arg) => arg.startsWith('https://'));
  const urlList = extra.length > 0 ? extra : INDEXNOW_URLS;
  const result = await notifyIndexNow(urlList);
  console.log(
    `IndexNow accepted ${result.count} URL(s) (${result.status}). Key: ${result.keyLocation}`,
  );
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
