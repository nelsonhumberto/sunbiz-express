import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectHrefFromError } from '@/lib/action-timeout';

const auth = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn((_name: string) => null as string | null));
const cookieGet = vi.hoisted(() => vi.fn((_name: string) => undefined as { value: string } | undefined));
const cookieSet = vi.hoisted(() => vi.fn());
const userCreate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const filingCreate = vi.hoisted(() => vi.fn());
const filingFindFirst = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/auth', () => ({ auth, signIn: vi.fn() }));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed') },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkActionRateLimit: () => null,
}));
vi.mock('next/headers', () => ({
  headers: () => ({ get: (name: string) => headerGet(name) }),
  cookies: () => ({
    get: (name: string) => cookieGet(name),
    set: (...args: unknown[]) => cookieSet(...args),
    delete: vi.fn(),
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { create: userCreate, findUnique: userFindUnique, update: userUpdate },
    filing: { create: filingCreate, findFirst: filingFindFirst, update: filingUpdate },
    additionalService: { findFirst: vi.fn(async () => null) },
    filingAdditionalService: { findFirst: vi.fn(async () => null), create: vi.fn() },
  },
}));

import { openGuestDraft, startGuestFiling } from '@/actions/guest-start';

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
}

async function redirectHref(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
  } catch (err) {
    return redirectHrefFromError(err);
  }
  return null;
}

describe('openGuestDraft navigation', () => {
  beforeEach(() => {
    auth.mockReset();
    auth.mockResolvedValue(null);
    headerGet.mockReset();
    headerGet.mockImplementation(() => null);
    cookieGet.mockReset();
    cookieGet.mockImplementation(() => undefined);
    cookieSet.mockReset();
    userCreate.mockReset();
    userCreate.mockResolvedValue({ id: 'user_1', email: 'guest.tok@guest.launchforma.invalid' });
    userFindUnique.mockReset();
    userFindUnique.mockResolvedValue(null);
    filingCreate.mockReset();
    filingFindFirst.mockReset();
    filingFindFirst.mockResolvedValue(null);
    filingUpdate.mockReset();
    filingUpdate.mockResolvedValue({});
    userUpdate.mockReset();
    userUpdate.mockResolvedValue({});
  });

  it('returns a localized redirectTo for the /start client in English and Spanish', async () => {
    filingCreate.mockResolvedValueOnce({ id: 'filing_en' });
    const english = await openGuestDraft({
      state: 'FL',
      entityType: 'LLC',
      businessName: 'Sol Norte',
      browserPath: '/start',
      returnRedirect: true,
    });
    expect(english).toEqual({ redirectTo: '/wizard/filing_en/2' });

    filingCreate.mockResolvedValueOnce({ id: 'filing_es' });
    const spanish = await openGuestDraft({
      state: 'FL',
      entityType: 'CORP',
      businessName: 'Sol Norte',
      browserPath: '/es/start',
      returnRedirect: true,
    });
    expect(spanish).toEqual({ redirectTo: '/es/wizard/filing_es/2' });
    expect(cookieSet.mock.calls.some((call) => call[0] === 'LF_GUEST_TOKEN')).toBe(true);
  });

  it('keeps /es when the rewrite headers say the English path', async () => {
    headerGet.mockImplementation((name: string) => {
      if (name === 'x-lf-public-path') return '/start';
      if (name === 'x-lf-locale') return 'en';
      if (name === 'next-action') return 'openGuestDraft';
      return null;
    });
    filingCreate.mockResolvedValueOnce({ id: 'filing_es' });
    const spanish = await openGuestDraft({
      state: 'FL',
      entityType: 'LLC',
      businessName: 'Sol Norte',
      browserPath: '/es/start',
      returnRedirect: true,
    });
    expect(spanish.redirectTo).toBe('/es/wizard/filing_es/2');
  });

  it('still redirects when the caller does not ask for a URL', async () => {
    filingCreate.mockResolvedValueOnce({ id: 'filing_en' });
    const english = await redirectHref(() =>
      openGuestDraft({
        state: 'FL',
        entityType: 'LLC',
        businessName: 'Sol Norte',
        browserPath: '/start',
      }),
    );
    expect(english).toBe('/wizard/filing_en/2');

    filingCreate.mockResolvedValueOnce({ id: 'filing_es' });
    const spanish = await redirectHref(() =>
      openGuestDraft({
        state: 'FL',
        entityType: 'LLC',
        businessName: 'Sol Norte',
        browserPath: '/es/start',
      }),
    );
    expect(spanish).toBe('/es/wizard/filing_es/2');
  });

  it('keeps startGuestFiling on redirect and does not create a draft for an invalid name', async () => {
    const action = readFileSync('actions/guest-start.ts', 'utf8');
    const openStart = action.indexOf('export async function openGuestDraft');
    const openEnd = action.indexOf('async function finishGuestDraft');
    const openBody = action.slice(openStart, openEnd);
    const startBody = action.slice(action.indexOf('export async function startGuestFiling'), openStart);
    expect(openBody).toContain('finishGuestDraft(');
    expect(openBody).not.toContain('redirectLocalized(');
    expect(startBody).toContain('redirectLocalized(');
    expect(startGuestFiling).toEqual(expect.any(Function));

    const invalid = await openGuestDraft({
      businessName: 'A',
      browserPath: '/es/start',
      returnRedirect: true,
    });
    expect(invalid).toEqual({ error: 'companyNameInvalid' });
    expect(invalid.redirectTo).toBeUndefined();
    expect(filingCreate).not.toHaveBeenCalled();

    const invalidRedirect = await redirectHref(() =>
      openGuestDraft({
        businessName: 'A',
        browserPath: '/start',
      }),
    );
    expect(invalidRedirect).toBeNull();
  });

  it('is only called from the /start client', () => {
    const files: string[] = [];
    for (const dir of ['app', 'components', 'actions', 'lib']) {
      walk(dir, files);
    }
    const callers = files
      .filter((file) => readFileSync(file, 'utf8').includes('openGuestDraft('))
      .map((file) => file.split(path.sep).join('/'));
    expect(callers.sort()).toEqual([
      'actions/guest-start.ts',
      'app/start/guest-start-launch.tsx',
    ]);
    const launch = readFileSync('app/start/guest-start-launch.tsx', 'utf8');
    expect(launch).toContain('returnRedirect: true');
    expect(launch).toContain('window.location.assign(redirectTo)');
    expect(launch).toContain('window.location.assign(href)');
  });
});
