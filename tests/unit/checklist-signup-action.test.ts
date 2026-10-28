import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const cookieGet = vi.hoisted(() => vi.fn(() => null as { value: string } | null));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'lf_utm' ? cookieGet() : null) }),
  headers: () => ({ get: () => '203.0.113.50' }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    checklistSignup: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
    marketingOptOut: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ status: 'SENT' }),
}));

import { captureChecklistSignup } from '@/actions/checklist-signup';
import { checklistFirstTouch } from '@/lib/checklist-lead';

describe('checklist signup action', () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    cookieGet.mockReset();
    upsert.mockResolvedValue({});
    process.env.SIGNUP_CAPTURE_ENABLED = 'true';
    process.env.NEXTAUTH_SECRET = 'test-secret';
  });

  it('stores source and UTM from the landing submit', async () => {
    findUnique.mockResolvedValue(null);
    cookieGet.mockReturnValue({
      value: JSON.stringify({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'llc',
        gclid: 'click-1',
      }),
    });
    const result = await captureChecklistSignup({
      email: 'ada@example.com',
      consent: true,
      locale: 'en',
      source: 'lp-florida-llc',
    });
    expect(result).toEqual({ ok: true });
    const created = upsert.mock.calls[0]?.[0] as { create: Record<string, string | null> };
    expect(created.create.source).toBe('lp-florida-llc');
    expect(created.create.utmSource).toBe('google');
    expect(created.create.utmMedium).toBe('cpc');
    expect(created.create.utmCampaign).toBe('llc');
    expect(created.create.gclid).toBe('click-1');
  });

  it('keeps the first source and UTM when a later submit has none', async () => {
    findUnique.mockResolvedValue({
      id: 'lead_1',
      email: 'ada@example.com',
      confirmedAt: null,
      checklistSentAt: null,
      consentAt: new Date(),
      source: 'lp-florida-llc',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'llc',
      utmContent: 'ad',
      utmTerm: 'florida llc',
      gclid: 'click-1',
    });
    cookieGet.mockReturnValue(null);
    const result = await captureChecklistSignup({
      email: 'ada@example.com',
      consent: true,
      locale: 'es',
    });
    expect(result).toEqual({ ok: true });
    const updated = upsert.mock.calls[0]?.[0] as { update: Record<string, string | null> };
    expect(updated.update.source).toBe('lp-florida-llc');
    expect(updated.update.utmSource).toBe('google');
    expect(updated.update.utmMedium).toBe('cpc');
    expect(updated.update.utmCampaign).toBe('llc');
    expect(updated.update.utmContent).toBe('ad');
    expect(updated.update.utmTerm).toBe('florida llc');
    expect(updated.update.gclid).toBe('click-1');
  });

  it('keeps first touch in the merge helper', () => {
    expect(
      checklistFirstTouch(
        { source: 'lp-florida-llc', utmSource: 'google', gclid: 'click-1' },
        {
          source: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmContent: null,
          utmTerm: null,
          gclid: null,
        },
      ),
    ).toMatchObject({ source: 'lp-florida-llc', utmSource: 'google', gclid: 'click-1' });
  });
});
