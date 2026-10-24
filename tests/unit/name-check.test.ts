import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SunbizError, checkNameAvailability } from '@/lib/sunbiz';
import { rateLimit } from '@/lib/rate-limit';
import {
  NAME_CHECK_MAX_LENGTH,
  canonicalFiledName,
  NAME_TOO_SHORT_ERROR,
  nameCheckClientError,
  nameCheckDelayMs,
  nameCheckErrorEvent,
  nameCheckErrorResponse,
  nameCheckResultEvent,
  nameCheckSubmittedEvent,
  nameHasMinimumSubstance,
  normalizeNameCheckQuery,
  peelTypedSuffix,
  realNameCharacterCount,
  requestNameCheck,
  seededBusinessName,
  startHrefForNameCheck,
} from '@/lib/name-check';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ ok: true, remaining: 29, retryAfterSeconds: 0 })),
  clientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/sunbiz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sunbiz')>('@/lib/sunbiz');
  return {
    ...actual,
    checkNameAvailability: vi.fn(),
  };
});

const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
  hero: Record<string, string>;
  wizard: Record<string, string>;
};
const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
  hero: Record<string, string>;
  wizard: Record<string, string>;
};

describe('homepage name check link', () => {
  it('trims, caps at 100 characters, and encodes the name', () => {
    expect(startHrefForNameCheck('fl', '  Acme LLC  ')).toBe('/start?state=FL&name=Acme+LLC');
    expect(startHrefForNameCheck('FL', '   ')).toBeNull();
    expect(startHrefForNameCheck('FL', '')).toBeNull();

    const href = startHrefForNameCheck('FL', `  ${'a'.repeat(150)}  `);
    const url = new URL(href!, 'http://localhost');
    expect(url.pathname).toBe('/start');
    expect(url.searchParams.get('state')).toBe('FL');
    expect(url.searchParams.get('name')).toHaveLength(NAME_CHECK_MAX_LENGTH);
    expect(url.searchParams.get('name')).toBe('a'.repeat(100));
  });

  it('keeps punctuation and non-ascii characters encoded', () => {
    const name = 'Niño & Co';
    expect(startHrefForNameCheck('wy', `  ${name}  `)).toBe(
      `/start?${new URLSearchParams({ state: 'WY', name }).toString()}`,
    );
  });
});

describe('seeded wizard name', () => {
  it('prefers the filing name and falls back to the start-form seed', () => {
    expect(seededBusinessName('  Acme LLC  ', 'Other')).toBe('Acme LLC');
    expect(seededBusinessName('   ', '  Palm Harbor  ')).toBe('Palm Harbor');
    expect(seededBusinessName(null, null)).toBe('');
    expect(normalizeNameCheckQuery(` ${'b'.repeat(120)} `)).toHaveLength(100);
  });

  it('checks the seeded name immediately and debounces later edits', () => {
    expect(nameCheckDelayMs('Acme LLC', 'Acme LLC')).toBe(0);
    expect(nameCheckDelayMs('Acme LL', 'Acme LLC')).toBe(400);
    expect(nameCheckDelayMs('Acme LLC', '')).toBe(400);
    expect(nameCheckDelayMs('A', 'A')).toBe(400);
  });
});

describe('name check analytics', () => {
  it('records submit source and the result status, duration, and error', () => {
    expect(nameCheckSubmittedEvent('hero')).toEqual({
      event: 'name_check_submitted',
      properties: { source: 'hero' },
    });
    expect(nameCheckSubmittedEvent('wizard')).toEqual({
      event: 'name_check_submitted',
      properties: { source: 'wizard' },
    });
    expect(nameCheckResultEvent({ status: 'available', ms: 12 })).toEqual({
      event: 'name_check_result',
      properties: { status: 'available', ms: 12 },
    });
    expect(nameCheckResultEvent({ status: 'error', ms: 40, error: 'timeout' })).toEqual({
      event: 'name_check_result',
      properties: { status: 'error', ms: 40, error: 'timeout' },
    });
    expect(nameCheckErrorEvent({ source: 'wizard', error: 'not_configured', ms: 80 })).toEqual({
      event: 'name_check',
      properties: { outcome: 'error', source: 'wizard', error: 'not_configured', ms: 80 },
    });
  });
});

describe('suffix stripping and real characters', () => {
  it('strips a typed legal ending so the dropdown does not double it', () => {
    expect(peelTypedSuffix('Name LLC')).toBe('Name');
    expect(peelTypedSuffix('Name L.L.C.')).toBe('Name');
    expect(peelTypedSuffix('Name Inc')).toBe('Name');
    expect(peelTypedSuffix('Name Corp')).toBe('Name');
    expect(peelTypedSuffix('Name LLC LLC')).toBe('Name');
    expect(peelTypedSuffix('Acme ')).toBe('Acme ');
    expect(canonicalFiledName('Name LLC LLC', 'LLC')).toBe('Name LLC');
    expect(canonicalFiledName('Name Inc LLC', 'LLC')).toBe('Name LLC');
    expect(canonicalFiledName('Atlantic Inc', 'CORP')).toBe('Atlantic Inc');
  });

  it('requires two real characters after the ending is removed', () => {
    expect(realNameCharacterCount('A LLC')).toBe(1);
    expect(realNameCharacterCount('Ab LLC')).toBe(2);
    expect(nameHasMinimumSubstance('A LLC')).toBe(false);
    expect(nameHasMinimumSubstance('Niño LLC')).toBe(true);
    expect(nameHasMinimumSubstance('!! LLC')).toBe(false);
    expect(NAME_TOO_SHORT_ERROR).toBe(
      'Enter at least 2 letters or numbers. The legal ending does not count.',
    );
  });
});

describe('name check failures', () => {
  it('classifies timeouts separately from other network failures', () => {
    expect(nameCheckClientError(new DOMException('timed out', 'TimeoutError'))).toBe('timeout');
    expect(nameCheckClientError(new DOMException('aborted', 'AbortError'))).toBe('timeout');
    expect(nameCheckClientError(new TypeError('Failed to fetch'))).toBe('network');
  });

  it('does not treat an error payload as available', async () => {
    const contradictory = await requestNameCheck(
      '/api/sunbiz/name-check?name=Acme',
      async () =>
        new Response(
          JSON.stringify({
            available: false,
            status: 'available',
            message: 'Too many lookups',
            conflicts: [],
            suggestions: [],
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        ),
    );
    expect(contradictory.deferred).toBe(true);
    expect(contradictory.status).toBe('error');
    expect(contradictory.result).toBeNull();

    const explicit = await requestNameCheck(
      '/api/sunbiz/name-check?name=Acme',
      async () =>
        new Response(
          JSON.stringify(
            nameCheckErrorResponse({ query: 'Acme', error: 'timeout', message: 'slow' }),
          ),
          { status: 504, headers: { 'content-type': 'application/json' } },
        ),
    );
    expect(explicit).toMatchObject({ deferred: true, status: 'error', error: 'timeout', result: null });
  });

  it('returns a real availability result when the lookup succeeds', async () => {
    const outcome = await requestNameCheck(
      '/api/sunbiz/name-check?name=Acme%20LLC',
      async () =>
        new Response(
          JSON.stringify({
            query: 'Acme LLC',
            available: true,
            status: 'available',
            message: 'ok',
            conflicts: [],
            suggestions: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    expect(outcome.deferred).toBe(false);
    if (outcome.deferred) return;
    expect(outcome.status).toBe('available');
    expect(outcome.result.available).toBe(true);
    expect(outcome.error).toBeUndefined();
  });

  it('reports a thrown timeout as an error result', async () => {
    const outcome = await requestNameCheck('/api/sunbiz/name-check?name=Acme', async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    expect(outcome).toMatchObject({ deferred: true, status: 'error', error: 'timeout', result: null });
  });
});

describe('name-check route errors', () => {
  beforeEach(() => {
    vi.mocked(rateLimit).mockReset();
    vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 29, retryAfterSeconds: 0 });
    vi.mocked(checkNameAvailability).mockReset();
  });

  it('returns status error instead of available when the lookup fails', async () => {
    const { GET } = await import('@/app/api/sunbiz/name-check/route');

    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, remaining: 0, retryAfterSeconds: 8 });
    const limited = await GET(new NextRequest('http://localhost/api/sunbiz/name-check?name=Acme%20LLC'));
    expect(limited.status).toBe(429);
    await expectErrorBody(limited, 'rate_limit');

    const missing = await GET(new NextRequest('http://localhost/api/sunbiz/name-check?name=A'));
    expect(missing.status).toBe(400);
    await expectErrorBody(missing, 'invalid');

    const tooLong = await GET(
      new NextRequest(
        `http://localhost/api/sunbiz/name-check?name=${encodeURIComponent('x'.repeat(101))}`,
      ),
    );
    expect(tooLong.status).toBe(400);
    await expectErrorBody(tooLong, 'invalid');

    vi.mocked(checkNameAvailability).mockRejectedValueOnce(new SunbizError('timeout', 'slow'));
    const timedOut = await GET(
      new NextRequest('http://localhost/api/sunbiz/name-check?name=Acme%20LLC'),
    );
    expect(timedOut.status).toBe(504);
    await expectErrorBody(timedOut, 'timeout');

    vi.mocked(checkNameAvailability).mockRejectedValueOnce(new Error('boom'));
    const unknown = await GET(
      new NextRequest('http://localhost/api/sunbiz/name-check?name=Acme%20LLC'),
    );
    expect(unknown.status).toBe(500);
    await expectErrorBody(unknown, 'unknown');
  });

  it('rewrites a contradictory available payload to status error', async () => {
    const { GET } = await import('@/app/api/sunbiz/name-check/route');
    vi.mocked(checkNameAvailability).mockResolvedValueOnce({
      query: 'A',
      available: false,
      status: 'available',
      message: 'Enter at least 2 characters to check availability.',
      conflicts: [],
      suggestions: [],
    });
    const res = await GET(new NextRequest('http://localhost/api/sunbiz/name-check?name=A%20LLC'));
    expect(res.status).toBe(400);
    await expectErrorBody(res, 'invalid');
  });

  it('still returns a successful availability payload', async () => {
    const { GET } = await import('@/app/api/sunbiz/name-check/route');
    vi.mocked(checkNameAvailability).mockResolvedValueOnce({
      query: 'Acme LLC',
      available: true,
      status: 'available',
      message: 'No conflicts',
      conflicts: [],
      suggestions: [],
    });
    const res = await GET(new NextRequest('http://localhost/api/sunbiz/name-check?name=Acme%20LLC'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('available');
    expect(body.available).toBe(true);
  });
});

describe('name check copy and wiring', () => {
  it('uses the deferred note in both locales without dashes', () => {
    expect(en.wizard.nameCheckDeferred).toBe(
      "We couldn't verify this name right now. We'll check it before filing.",
    );
    expect(es.wizard.nameCheckDeferred).toBe(
      'No pudimos verificar este nombre ahora. Lo revisamos antes de presentar.',
    );
    expect(en.wizard.nameCheckRetry).toBe('Retry');
    expect(es.wizard.nameCheckRetry).toBe('Reintentar');
    expect(en.wizard.namePlaceholderLLC).toBe('e.g., Sunshine Coast Ventures');
    expect(en.wizard.namePlaceholderCorp).toBe('e.g., Atlantic Holdings');
    expect(es.wizard.namePlaceholderLLC).not.toMatch(/LLC|Inc/);
    expect(es.wizard.namePlaceholderCorp).not.toMatch(/LLC|Inc/);
    expect(en.wizard.saveExitBenefitDocuments).not.toMatch(/temporary password|resume link|email/i);
    expect(es.wizard.saveExitBenefitDocuments).not.toMatch(/contraseña temporal|enlace para reanudar/i);
    expect(en.hero.checkName).toBe('Check name');
    expect(es.hero.checkName).toBe('Verificar nombre');
    for (const messages of [en, es]) {
      expect(messages.hero.checkName).not.toMatch(/—|–/);
      expect(messages.hero.nameCheckPlaceholder).not.toMatch(/—|–/);
      expect(messages.hero.previewHint).not.toMatch(/—|–/);
      expect(messages.wizard.nameCheckDeferred).not.toMatch(/—|–/);
      expect(messages.hero.previewAvailable).toBeUndefined();
      expect(messages.hero.previewSuccess).toBeUndefined();
    }
  });

  it('puts the live name field above the start button and drops the fake result', () => {
    const hero = readFileSync('components/marketing/Hero.tsx', 'utf8');
    const field = hero.indexOf('<HeroNameCheck');
    const start = hero.indexOf("t('startFiling')");
    expect(field).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(field);
    expect(hero).toContain("nameCheckSubmittedEvent('hero')");
    expect(hero).toContain('startHrefForNameCheck');
    expect(hero).not.toContain('Sunshine Coast Ventures');
    expect(hero).not.toContain('readOnly');
    expect(hero).not.toContain('previewAvailable');
    expect(hero).not.toContain('previewSuccess');
  });

  it('checks a seeded name on mount and shows the deferred note', () => {
    const widget = readFileSync('components/wizard/NameCheckWidget.tsx', 'utf8');
    const step = readFileSync('components/wizard/steps/Step2Name.tsx', 'utf8');
    expect(widget).toContain('seededBusinessName(initialName, defaultBusinessName)');
    expect(widget).toContain('nameCheckDelayMs');
    expect(widget).toContain("nameCheckSubmittedEvent('wizard')");
    expect(widget).toContain('nameCheckResultEvent');
    expect(widget).toContain("t('nameCheckDeferred')");
    expect(widget).toContain("t('nameCheckRetry')");
    expect(widget).toContain('nameCheckErrorEvent');
    expect(widget).toContain('peelTypedSuffix');
    expect(step).toContain('nameHasMinimumSubstance');
    expect(step).toContain("t('nameTooShort')");
    expect(step).toContain('onBlocked');
    expect(step).toContain('seededBusinessName(filing.businessName)');
    const saveStep = readFileSync('actions/wizard.ts', 'utf8');
    expect(saveStep).toContain('Step2Schema.safeParse');
    expect(saveStep).toContain('canonicalFiledName');
    expect(saveStep).toContain('NAME_TOO_SHORT_ERROR');
    const chat = readFileSync('components/assistant/ChatWidget.tsx', 'utf8');
    expect(chat).toContain("onWizard && 'max-md:hidden'");
    const guest = readFileSync('components/wizard/GuestAccountPrompt.tsx', 'utf8');
    expect(guest).not.toMatch(/temporary password|resume link|Email confirmations/i);
    expect(guest).toContain("t('saveExitBenefitDocuments')");
    const sunbiz = readFileSync('lib/sunbiz.ts', 'utf8');
    expect(sunbiz).not.toMatch(/available:\s*false,\s*status:\s*'available'/);
    expect(readFileSync('lib/sunbiz-mock.ts', 'utf8')).not.toMatch(
      /available:\s*false,\s*status:\s*'available'/,
    );
    expect(readFileSync('app/start/page.tsx', 'utf8')).not.toContain('seededName ? 3');
    expect(readFileSync('actions/guest-start.ts', 'utf8')).not.toContain('seededName ? 3');
    expect(readFileSync('app/api/sunbiz/name-check/route.ts', 'utf8')).not.toContain(
      "status: 'available'",
    );
  });
});

async function expectErrorBody(res: Response, error: string) {
  const body = await res.json();
  expect(body.status).toBe('error');
  expect(body.available).toBe(false);
  expect(body.error).toBe(error);
  expect(body.status).not.toBe('available');
}
