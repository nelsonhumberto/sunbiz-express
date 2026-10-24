import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import { OA_GUIDE_EN } from '@/lib/oa-guide-copy';
import {
  OA_COMING_SOON,
  OA_CONFIRM_TTL_MS,
  OA_PUBLIC_DIR,
  OA_SAMPLE_HEADER,
  OA_TEMPLATE_ASSETS,
  hashOaToken,
  mintOaToken,
  oaAssetPath,
  oaConfirmExpiry,
  oaConfirmUrl,
  oaDownloadPagePath,
  oaTemplateDownloadEnabled,
  oaTemplateLinks,
  oaUnsubscribeSignatureValid,
  oaUnsubscribeUrl,
  openOaDownloadSession,
  sealOaDownloadSession,
} from '@/lib/oa-template';

const LEAD_ID = '11111111-1111-4111-8111-111111111111';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

describe('operating agreement template flag and files', () => {
  it('stays off unless the env is an explicit on value', () => {
    const previous = process.env.OA_TEMPLATE_DOWNLOAD_ENABLED;
    delete process.env.OA_TEMPLATE_DOWNLOAD_ENABLED;
    expect(oaTemplateDownloadEnabled()).toBe(false);
    process.env.OA_TEMPLATE_DOWNLOAD_ENABLED = 'false';
    expect(oaTemplateDownloadEnabled()).toBe(false);
    process.env.OA_TEMPLATE_DOWNLOAD_ENABLED = 'true';
    expect(oaTemplateDownloadEnabled()).toBe(true);
    if (previous === undefined) delete process.env.OA_TEMPLATE_DOWNLOAD_ENABLED;
    else process.env.OA_TEMPLATE_DOWNLOAD_ENABLED = previous;
  });

  it('serves the eight samples from an unguessable public directory', () => {
    expect(OA_PUBLIC_DIR).toMatch(/^[0-9a-f]{32}$/);
    const dir = path.join('public/oa', OA_PUBLIC_DIR);
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.pdf') || name.endsWith('.docx'))
      .sort();
    expect(files).toEqual(OA_TEMPLATE_ASSETS.map((asset) => asset.filename).sort());
    expect(existsSync('lib/oa-template-storage.ts')).toBe(false);
    expect(existsSync('scripts/upload-oa-lead-magnets.mjs')).toBe(false);
    expect(existsSync('content/oa-templates/downloads')).toBe(false);
    expect(OA_TEMPLATE_ASSETS.filter((asset) => asset.locale === 'en')).toHaveLength(4);
    expect(OA_TEMPLATE_ASSETS.filter((asset) => asset.locale === 'es')).toHaveLength(4);
  });

  it('does not require a Supabase URL or service role key', () => {
    const roots = ['app', 'lib', 'scripts', 'components'];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
        const text = readFileSync(file, 'utf8');
        if (text.includes('SUPABASE_URL') || text.includes('SUPABASE_SERVICE_ROLE_KEY')) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
    expect(readFileSync('.env.example', 'utf8')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(readFileSync('.env.example', 'utf8')).not.toContain('SUPABASE_URL');
  });

  it('keeps the leads table private and double opt-in', () => {
    const sql = readFileSync('prisma/migrations/20261024180000_add_leads/migration.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE "leads"');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CITEXT');
    expect(sql).toContain('CHECK ("consent")');
    expect(sql).toContain("CHECK (\"locale\" IN ('en', 'es'))");
    expect(sql).toContain('leads_email_source_key');
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).toContain('REVOKE ALL ON TABLE public.leads FROM anon, authenticated');
    expect(OA_CONFIRM_TTL_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('hides /oa from crawlers without publishing the secret directory', () => {
    const robots = readFileSync('app/robots.ts', 'utf8');
    const config = readFileSync('next.config.js', 'utf8');
    expect(robots).toContain("'/oa/'");
    expect(robots).not.toContain(OA_PUBLIC_DIR);
    expect(config).toContain("source: '/oa/:path*'");
    expect(config).toContain('noindex, nofollow');
    expect(config).not.toContain(OA_PUBLIC_DIR);
  });
});

describe('operating agreement token links', () => {
  it('points confirmation at the leads route and the locale download page', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://launchforma.com';
    const token = mintOaToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oaConfirmUrl(token)).toBe(
      `https://launchforma.com/api/leads/confirm?token=${encodeURIComponent(token)}`,
    );
    expect(oaDownloadPagePath('en')).toBe('/guides/florida-llc-operating-agreement/download');
    expect(oaDownloadPagePath('es')).toBe('/es/guides/florida-llc-operating-agreement/download');
    expect(hashOaToken(token)).toHaveLength(64);
    const expiry = oaConfirmExpiry(Date.parse('2026-10-24T00:00:00.000Z'));
    expect(expiry.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('links each language to four static sample files', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://launchforma.com';
    for (const locale of ['en', 'es'] as const) {
      const links = oaTemplateLinks(locale);
      expect(links).toHaveLength(4);
      expect(links.map((link) => `${link.variant}:${link.format}`).sort()).toEqual([
        'multi:docx',
        'multi:pdf',
        'single:docx',
        'single:pdf',
      ]);
      for (const link of links) {
        expect(link.url).toBe(`https://launchforma.com${oaAssetPath(link.filename)}`);
        expect(link.url).toContain(`/oa/${OA_PUBLIC_DIR}/`);
      }
    }
  });

  it('signs unsubscribe links and the download session', () => {
    process.env.NEXTAUTH_SECRET = 'test-secret';
    const url = new URL(oaUnsubscribeUrl(LEAD_ID));
    expect(url.pathname).toBe('/api/leads/unsubscribe');
    expect(oaUnsubscribeSignatureValid(LEAD_ID, url.searchParams.get('sig') ?? '')).toBe(true);
    expect(oaUnsubscribeSignatureValid(LEAD_ID, 'nope')).toBe(false);

    const sealed = sealOaDownloadSession(LEAD_ID, 'es', Date.parse('2026-10-24T00:00:00.000Z'));
    expect(openOaDownloadSession(sealed, Date.parse('2026-10-24T00:00:00.000Z'))).toEqual({
      id: LEAD_ID,
      locale: 'es',
    });
    expect(openOaDownloadSession(sealed, Date.parse('2026-11-01T00:00:00.000Z'))).toBeNull();
    expect(openOaDownloadSession(`${sealed}x`)).toBeNull();
  });

  it('keeps the not-legal-advice line', () => {
    expect(OA_SAMPLE_HEADER.en).toContain('not legal advice');
    expect(OA_SAMPLE_HEADER.es).toContain('no es asesoría legal');
    expect(OA_COMING_SOON.en).toBe('Free sample template coming soon.');
    expect(OA_COMING_SOON.es).toBe('Plantilla de muestra gratis muy pronto.');
    expect(OA_GUIDE_EN.download.comingSoon).toBe(OA_COMING_SOON.en);
    expect(OA_GUIDE_EN.download.sampleHeader).toBe(OA_SAMPLE_HEADER.en);
    expect(es.guideOa.downloadComingSoon).toBe(OA_COMING_SOON.es);
    expect(es.guideOa.downloadSampleHeader).toBe(OA_SAMPLE_HEADER.es);
    expect(OA_SAMPLE_HEADER.es).not.toMatch(/—|–/);
    expect(OA_COMING_SOON.es).not.toMatch(/—|–/);
  });
});
