import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import { OA_GUIDE_EN } from '@/lib/oa-guide-copy';
import {
  OA_BUCKET,
  OA_COMING_SOON,
  OA_CONFIRM_TTL_MS,
  OA_SAMPLE_HEADER,
  OA_SIGNED_URL_TTL_SECONDS,
  OA_TEMPLATE_ASSETS,
  absoluteStorageSignedUrl,
  hashOaToken,
  mintOaToken,
  oaConfirmExpiry,
  oaConfirmUrl,
  oaDownloadPagePath,
  oaTemplateDownloadEnabled,
  oaUnsubscribeSignatureValid,
  oaUnsubscribeUrl,
  openOaDownloadSession,
  sealOaDownloadSession,
} from '@/lib/oa-template';

const LEAD_ID = '11111111-1111-4111-8111-111111111111';

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

  it('commits the eight samples the upload script sends', () => {
    const files = readdirSync('content/oa-templates/downloads')
      .filter((name) => name.endsWith('.pdf') || name.endsWith('.docx'))
      .sort();
    expect(files).toEqual(OA_TEMPLATE_ASSETS.map((asset) => asset.filename).sort());
    const script = readFileSync('scripts/upload-oa-lead-magnets.mjs', 'utf8');
    expect(script).toContain(OA_BUCKET);
    expect(script).toContain('public: false');
    for (const name of files) expect(script).toContain(name);
    expect(OA_TEMPLATE_ASSETS.filter((asset) => asset.locale === 'en')).toHaveLength(4);
    expect(OA_TEMPLATE_ASSETS.filter((asset) => asset.locale === 'es')).toHaveLength(4);
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
    expect(OA_SIGNED_URL_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
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

  it('builds an absolute signed storage URL and keeps the not-legal-advice line', () => {
    expect(
      absoluteStorageSignedUrl(
        'https://project.supabase.co/',
        '/object/sign/lead-magnets/sample.pdf?token=abc',
      ),
    ).toBe('https://project.supabase.co/storage/v1/object/sign/lead-magnets/sample.pdf?token=abc');
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
