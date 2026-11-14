import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const documentUpdate = vi.hoisted(() => vi.fn());
const documentCreate = vi.hoisted(() => vi.fn());
const faxCreate = vi.hoisted(() => vi.fn());
const faxUpdate = vi.hoisted(() => vi.fn());
const telnyxSendFax = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique },
    document: { update: documentUpdate, create: documentCreate },
    faxMessage: { create: faxCreate, update: faxUpdate },
  },
}));
vi.mock('@/lib/telnyx', () => ({
  telnyxSendFax,
  normalizeFaxNumber: (value: string) => value,
  TelnyxError: class TelnyxError extends Error {
    detail?: unknown;
    constructor(message: string, detail?: unknown) {
      super(message);
      this.detail = detail;
    }
  },
}));
vi.mock('@/lib/filing-documents', () => ({
  renderArticlesHtml: () => '<html></html>',
}));
vi.mock('@/lib/html-to-pdf', () => ({
  htmlDocumentToPdf: async () => new Uint8Array([1, 2, 3]),
  mergePdfDocuments: async () => new Uint8Array([4, 5, 6]),
  pdfFilename: (name: string) => `${name}.pdf`,
}));
vi.mock('@/lib/sunbiz-cover', () => ({
  NOTICE_EMAIL: 'notice@example.com',
  stripBlankPdfPages: async (bytes: Uint8Array) => bytes,
}));

import { POST } from '@/app/api/admin/filings/[id]/file-package/route';
import {
  SUNBIZ_FAX_TEST_BLOCK_MESSAGE,
  sunbizFaxBlockBody,
  sunbizFaxBlocked,
} from '@/lib/sunbiz-fax-guard';

const REAL_FILING = {
  id: 'fil_real',
  businessName: 'Harbor Goods LLC',
  entityType: 'LLC',
  isTest: false,
  user: { isTester: false },
  managersMembers: [],
  documents: [
    {
      id: 'doc_cover',
      documentType: 'SUNBIZ_COVER_PAGE',
      base64: Buffer.from('%PDF-1.4\n').toString('base64'),
      mimeType: 'application/pdf',
    },
  ],
};

function adminSession() {
  auth.mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } });
}

function post(id = 'fil_real') {
  return POST({} as never, { params: { id } });
}

beforeEach(() => {
  auth.mockReset();
  filingFindUnique.mockReset();
  documentUpdate.mockReset();
  documentCreate.mockReset();
  faxCreate.mockReset();
  faxUpdate.mockReset();
  telnyxSendFax.mockReset();
  process.env.TELNYX_FAX_CONNECTION_ID = 'conn_test';
  process.env.TELNYX_FAX_FROM = '+15555550100';
  adminSession();
  documentCreate.mockResolvedValue({ id: 'doc_pkg' });
  faxCreate.mockResolvedValue({ id: 'fax_1' });
  faxUpdate.mockResolvedValue({ id: 'fax_1' });
  telnyxSendFax.mockResolvedValue({ id: 'telnyx_1', status: 'queued' });
});

describe('sunbizFaxBlocked', () => {
  it('blocks a test filing or a tester owner and lets a real filing through', () => {
    expect(sunbizFaxBlocked(null)).toBe(false);
    expect(sunbizFaxBlocked({ isTest: false, isTester: false })).toBe(false);
    expect(sunbizFaxBlocked({ isTest: true, isTester: false })).toBe(true);
    expect(sunbizFaxBlocked({ isTest: false, isTester: true })).toBe(true);
    expect(sunbizFaxBlocked({ isTest: true, isTester: true })).toBe(true);
    expect(sunbizFaxBlockBody({ isTest: true, isTester: false })).toEqual({
      error: 'test_filing',
      dryRun: true,
      message: SUNBIZ_FAX_TEST_BLOCK_MESSAGE,
    });
    expect(sunbizFaxBlockBody({ isTest: false, isTester: false })).toBeNull();
    expect(SUNBIZ_FAX_TEST_BLOCK_MESSAGE).not.toContain('\u2014');
  });
});

describe('POST /api/admin/filings/[id]/file-package', () => {
  it('does not fax Sunbiz when the filing isTest', async () => {
    filingFindUnique.mockResolvedValue({ isTest: true, user: { isTester: false } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await post('fil_test');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: 'test_filing',
      dryRun: true,
      message: SUNBIZ_FAX_TEST_BLOCK_MESSAGE,
    });
    expect(telnyxSendFax).not.toHaveBeenCalled();
    expect(faxCreate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[lf:filing]'),
      'Sunbiz fax skipped for test filing',
      expect.objectContaining({ entityId: 'fil_test', isTest: true, isTester: false }),
    );
    warn.mockRestore();
  });

  it('does not fax Sunbiz when the owner isTester', async () => {
    filingFindUnique.mockResolvedValue({ isTest: false, user: { isTester: true } });

    const res = await post('fil_tester');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.dryRun).toBe(true);
    expect(body.message).toBe(SUNBIZ_FAX_TEST_BLOCK_MESSAGE);
    expect(telnyxSendFax).not.toHaveBeenCalled();
    expect(faxCreate).not.toHaveBeenCalled();
  });

  it('still faxes a real filing', async () => {
    filingFindUnique.mockImplementation(async (args: { select?: unknown }) => {
      if (args?.select) return { isTest: false, user: { isTester: false } };
      return REAL_FILING;
    });

    const res = await post('fil_real');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, faxId: 'fax_1', status: 'queued' });
    expect(telnyxSendFax).toHaveBeenCalledTimes(1);
    expect(telnyxSendFax).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+18506176381',
        from: '+15555550100',
        connectionId: 'conn_test',
      }),
    );
    expect(faxCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps the missing-config response for a real filing', async () => {
    delete process.env.TELNYX_FAX_CONNECTION_ID;
    filingFindUnique.mockResolvedValue({ isTest: false, user: { isTester: false } });

    const res = await post('fil_real');
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('config_missing');
    expect(telnyxSendFax).not.toHaveBeenCalled();
    expect(faxCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-admin before any lookup or fax', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1', role: 'USER' } });

    const res = await post('fil_real');

    expect(res.status).toBe(401);
    expect(filingFindUnique).not.toHaveBeenCalled();
    expect(telnyxSendFax).not.toHaveBeenCalled();
  });

  it('shows the skip message in the admin panel instead of a sent toast', () => {
    const panel = readFileSync('app/(admin)/admin/filings/[id]/file-company-panel.tsx', 'utf8');
    const onFax = panel.slice(panel.indexOf('const onFax'), panel.indexOf('return ('));
    const dryRunAt = onFax.indexOf('data.dryRun');
    const successAt = onFax.indexOf('Fax sent to Sunbiz');
    expect(dryRunAt).toBeGreaterThan(-1);
    expect(successAt).toBeGreaterThan(dryRunAt);
    expect(onFax).toContain('SUNBIZ_FAX_TEST_BLOCK_MESSAGE');
    expect(onFax).toContain('setFaxNotice(text)');
    expect(panel).toContain('role="status"');
  });
});
