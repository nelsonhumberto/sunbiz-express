import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_FORMATION_STATES,
  ENABLED_FORMATION_STATES,
  FLORIDA_ONLY_NOTE,
  FORMATION_STATES,
  floridaOnlyNote,
  getFormationState,
  resolveRequestedFormationState,
} from '@/lib/formation-states';
import { InactiveFormationStateError, quoteDraftFiling } from '@/lib/filing-totals';
import {
  ACTIVE_MARKETING_STATES,
  marketingStateForVisitor,
} from '@/lib/marketing-states';

const auth = vi.hoisted(() => vi.fn());
const getWizardActor = vi.hoisted(() => vi.fn());
const filingCreate = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/auth', () => ({ auth, signIn: vi.fn() }));
vi.mock('@/lib/guest', () => ({
  getWizardActor,
  getGuestUser: vi.fn(),
}));
vi.mock('@/lib/stored-locale', () => ({
  storedLocale: async () => 'en',
  storedEntryPath: () => null,
}));
vi.mock('@/lib/locale-redirect', () => ({
  redirectLocalized: vi.fn(async (path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/actions/guest-email', () => ({ saveGuestEmail: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkActionRateLimit: () => null }));
vi.mock('next/headers', () => ({
  headers: () => ({ get: () => null }),
  cookies: () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: {
      create: filingCreate,
      findUnique: filingFindUnique,
      update: filingUpdate,
      findFirst: vi.fn(),
    },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    additionalService: { findFirst: vi.fn(async () => null) },
    filingAdditionalService: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}));

import { createFiling } from '@/actions/filings';
import { saveStep1 } from '@/actions/wizard';

describe('Florida-only formation', () => {
  it('keeps the active set on Florida and leaves Wyoming and Delaware rules defined', () => {
    expect([...ENABLED_FORMATION_STATES]).toEqual(['FL']);
    expect([...ACTIVE_FORMATION_STATES]).toEqual(['FL']);
    expect(ACTIVE_MARKETING_STATES.map((state) => state.code)).toEqual(['FL']);
    expect(getFormationState('WY').code).toBe('WY');
    expect(getFormationState('DE').code).toBe('DE');
    expect(FORMATION_STATES.WY.name).toBe('Wyoming');
    expect(FORMATION_STATES.DE.name).toBe('Delaware');
  });

  it('resolves a Wyoming or Delaware start request to Florida plus the note', () => {
    expect(resolveRequestedFormationState('WY')).toEqual({
      stateCode: 'FL',
      fellBackFromInactive: true,
    });
    expect(resolveRequestedFormationState('delaware')).toEqual({
      stateCode: 'FL',
      fellBackFromInactive: true,
    });
    expect(resolveRequestedFormationState('FL')).toEqual({
      stateCode: 'FL',
      fellBackFromInactive: false,
    });
    expect(resolveRequestedFormationState('GA').fellBackFromInactive).toBe(false);
    expect(floridaOnlyNote('en')).toBe(FLORIDA_ONLY_NOTE.en);
    expect(floridaOnlyNote('es')).toBe(FLORIDA_ONLY_NOTE.es);
    expect(FLORIDA_ONLY_NOTE.en).toBe('We currently form Florida companies only.');
    expect(FLORIDA_ONLY_NOTE.es).toBe('Por ahora solo formamos empresas en Florida.');

    const startPage = readFileSync('app/start/page.tsx', 'utf8');
    expect(startPage).toContain('resolveRequestedFormationState(searchParams?.state)');
    expect(startPage).toContain('floridaOnlyNote(locale)');
    expect(startPage).toContain('role="status"');

    expect(marketingStateForVisitor('WY')).toMatchObject({
      fellBackFromInactive: true,
      state: { code: 'FL', availability: 'active' },
    });
    expect(marketingStateForVisitor('DE').state.code).toBe('FL');
    const pricing = readFileSync('app/(marketing)/pricing/page.tsx', 'utf8');
    expect(pricing).toContain('marketingStateForVisitor');
    expect(pricing).toContain('floridaOnlyNote(locale)');
    expect(pricing).not.toContain('/start?state=WY');
    expect(pricing).not.toContain('/start?state=DE');
  });

  it('refuses to price a Wyoming or Delaware filing as Florida', () => {
    const draft = {
      entityType: 'LLC',
      serviceTier: 'BASIC',
      optionalDetails: null,
      filingAdditionalServices: [],
    };
    expect(() => quoteDraftFiling({ ...draft, state: 'WY' })).toThrow(InactiveFormationStateError);
    expect(() => quoteDraftFiling({ ...draft, state: 'DE' })).toThrow(InactiveFormationStateError);
    expect(quoteDraftFiling({ ...draft, state: 'FL' }).totalCents).toBeGreaterThan(0);
  });

  describe('server actions', () => {
    beforeEach(() => {
      auth.mockReset();
      auth.mockResolvedValue({ user: { id: 'user_1', email: 'ada@example.com' } });
      getWizardActor.mockReset();
      getWizardActor.mockResolvedValue({ kind: 'user', id: 'user_1', email: 'ada@example.com' });
      filingCreate.mockReset();
      filingFindUnique.mockReset();
      filingUpdate.mockReset();
      filingUpdate.mockResolvedValue({});
    });

    it('rejects Wyoming and Delaware in the wizard without rewriting the draft', async () => {
      for (const state of ['WY', 'DE']) {
        filingFindUnique.mockResolvedValue({
          id: 'filing_1',
          userId: 'user_1',
          state,
          locale: 'en',
          entityType: 'LLC',
          serviceTier: 'STANDARD',
          currentStep: 1,
          completedSteps: '[]',
        });
        filingUpdate.mockClear();
        const result = await saveStep1({
          filingId: 'filing_1',
          entityType: 'LLC',
          state,
        });
        expect(result).toEqual({ ok: false, error: 'That state is not available.' });
        expect(filingUpdate).not.toHaveBeenCalled();
      }
    });

    it('rejects Wyoming and Delaware when creating a filing', async () => {
      for (const state of ['WY', 'DE']) {
        filingCreate.mockClear();
        const result = await createFiling({ state, entityType: 'LLC' });
        expect(result).toEqual({ ok: false, error: 'That state is not available.' });
        expect(filingCreate).not.toHaveBeenCalled();
      }
    });
  });
});
