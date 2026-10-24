import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_URLS,
  indexNowKeyFromPublic,
  notifyIndexNow,
} from '../../scripts/indexnow.mjs';

describe('IndexNow', () => {
  it('commits a public key file and an npm notify command', () => {
    const { key, filename } = indexNowKeyFromPublic();
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect(readFileSync(`public/${filename}`, 'utf8')).toBe(key);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { indexnow: string } };
    expect(pkg.scripts.indexnow).toBe('node scripts/indexnow.mjs');
  });

  it('POSTs the five Spanish guide URLs to api.indexnow.org', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const raw = init?.body;
      calls.push({
        url: String(url),
        body: typeof raw === 'string' ? raw : '',
      });
      return new Response('', { status: 202 });
    };
    const result = await notifyIndexNow(INDEXNOW_URLS, fetchImpl);
    expect(result.status).toBe(202);
    expect(result.count).toBe(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(INDEXNOW_ENDPOINT);
    const body = JSON.parse(calls[0]?.body ?? '{}') as {
      host: string;
      key: string;
      keyLocation: string;
      urlList: string[];
    };
    expect(body.host).toBe('launchforma.com');
    expect(body.keyLocation).toBe(`https://launchforma.com/${body.key}.txt`);
    expect(body.urlList).toEqual([
      'https://launchforma.com/es/guides/llc-florida-sin-seguro-social',
      'https://launchforma.com/es/guides/licencia-negocio-miami-dade',
      'https://launchforma.com/es/guides/licencia-negocio-broward',
      'https://launchforma.com/es/guides/llc-o-negocio-individual-florida',
      'https://launchforma.com/es/guides/llc-para-tu-app-florida',
    ]);
  });
});
