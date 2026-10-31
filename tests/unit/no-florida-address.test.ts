import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_ON_BY_SLUG,
  RA_RENEWAL_PRICE_CENTS,
  computeCost,
  tierBundledAddOns,
} from '@/lib/pricing';
import {
  validateGeneralAddress,
  validateRegisteredAgentAddress,
} from '@/lib/formation-validation';
import { FORMATION_STATES } from '@/lib/formation-states';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const auth = vi.hoisted(() => vi.fn());
const getWizardActor = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());
const filingAdditionalServiceCreate = vi.hoisted(() => vi.fn());

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
      findUnique: filingFindUnique,
      update: filingUpdate,
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    additionalService: { findFirst: vi.fn(async () => null) },
    filingAdditionalService: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      create: filingAdditionalServiceCreate,
      delete: vi.fn(),
    },
    registeredAgentService: { create: vi.fn() },
  },
}));

import { saveStep4 } from '@/actions/wizard';

const outOfState = {
  street1: '1 Market Street',
  city: 'San Francisco',
  state: 'CA',
  zip: '94105',
};

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

describe('principal address outside Florida', () => {
  beforeEach(() => {
    auth.mockReset();
    auth.mockResolvedValue({ user: { id: 'user_1', email: 'ada@example.com' } });
    getWizardActor.mockReset();
    getWizardActor.mockResolvedValue({ kind: 'user', id: 'user_1', email: 'ada@example.com' });
    filingFindUnique.mockReset();
    filingUpdate.mockReset();
    filingAdditionalServiceCreate.mockReset();
    filingUpdate.mockResolvedValue({});
    filingFindUnique.mockResolvedValue({
      id: 'filing_1',
      userId: 'user_1',
      state: 'FL',
      locale: 'en',
      entityType: 'LLC',
      serviceTier: 'STANDARD',
      currentStep: 4,
      completedSteps: '[]',
      registeredAgent: null,
      principalAddress: null,
    });
  });

  it('accepts an out-of-state principal address and does not require Florida', () => {
    expect(validateGeneralAddress(outOfState).valid).toBe(true);
    expect(validateRegisteredAgentAddress(outOfState, 'FL').valid).toBe(false);
    expect(FORMATION_STATES.FL.addressRules.principalAddressMustBeInState).toBe(false);
    expect(FORMATION_STATES.FL.addressRules.registeredAgentAddressMustBeInState).toBe(true);
  });

  it('saves a California principal address without a new product or price', async () => {
    const result = await saveStep4({
      filingId: 'filing_1',
      address: outOfState,
      noFloridaAddress: false,
    });
    expect(result).toEqual({ ok: true });
    expect(filingAdditionalServiceCreate).not.toHaveBeenCalled();
    const data = filingUpdate.mock.calls[0][0].data as {
      principalAddress: string;
      registeredAgent?: string;
      totalCents?: number;
      serviceFeeCents?: number;
    };
    expect(JSON.parse(data.principalAddress)).toMatchObject({ state: 'CA', street1: '1 Market Street' });
    expect(JSON.parse(data.principalAddress).noFloridaAddress).toBeUndefined();
    expect(data.registeredAgent).toBeUndefined();
    expect(data.totalCents).toBeUndefined();
    expect(data.serviceFeeCents).toBeUndefined();
  });

  it('records the no-Florida-address choice on the existing address JSON', async () => {
    const result = await saveStep4({
      filingId: 'filing_1',
      address: outOfState,
      noFloridaAddress: true,
    });
    expect(result).toEqual({ ok: true });
    const data = filingUpdate.mock.calls[0][0].data as { principalAddress: string };
    const stored = JSON.parse(data.principalAddress) as {
      state: string;
      noFloridaAddress?: boolean;
    };
    expect(stored.state).toBe('CA');
    expect(stored.noFloridaAddress).toBe(true);
    expect(Object.keys(filingUpdate.mock.calls[0][0].data).sort()).toEqual([
      'completedSteps',
      'currentStep',
      'principalAddress',
    ]);
  });
});

describe('registered agent product stays the one already sold', () => {
  it('keeps year-1 free inside every package and leaves the renewal price alone', () => {
    const agent = ADD_ON_BY_SLUG.registered_agent;
    expect(agent.serviceMarginCents).toBe(0);
    expect(agent.priceCents).toBe(0);
    expect(agent.description).toBe(
      'Year-1 free. In-state physical address provided, legal mail scanned, your home address kept off the public record.',
    );
    expect(RA_RENEWAL_PRICE_CENTS).toBe(15_000);
    expect(FORMATION_STATES.FL.registeredAgent.renewalCents).toBe(15_000);
    for (const tier of ['BASIC', 'STANDARD', 'PREMIUM'] as const) {
      expect(tierBundledAddOns(tier)).toContain('registered_agent');
      const cost = computeCost({
        entityType: 'LLC',
        tier,
        addOnSlugs: ['registered_agent'],
        state: 'FL',
      });
      expect(cost.addOnsCents).toBe(0);
      expect(cost.lines.some((line) => line.addOnSlug === 'registered_agent')).toBe(false);
    }
  });
});

describe('address step copy and analytics', () => {
  const freshEn = [
    en.wizard.addressChoiceLegend,
    en.wizard.hasInStateAddress,
    en.wizard.noInStateAddress,
  ];
  const freshEs = [
    es.wizard.addressChoiceLegend,
    es.wizard.hasInStateAddress,
    es.wizard.noInStateAddress,
  ];

  it('adds the choice in English and Spanish without an em dash', () => {
    expect(en.wizard.addressChoiceLegend).toBe('Do you have a {state} address?');
    expect(en.wizard.hasInStateAddress).toBe('I have a {state} address');
    expect(en.wizard.noInStateAddress).toBe("I don't have a {state} address");
    expect(es.wizard.addressChoiceLegend).toBe('¿Tienes una dirección en {state}?');
    expect(es.wizard.hasInStateAddress).toBe('Tengo una dirección en {state}');
    expect(es.wizard.noInStateAddress).toBe('No tengo una dirección en {state}');
    for (const copy of [...freshEn, ...freshEs]) {
      expect(copy).not.toMatch(/\u2014|\u2013/);
    }
    expect(es.wizard.addressChoiceLegend.startsWith('¿Tienes')).toBe(true);
    expect(es.wizard.noInStateAddress).not.toMatch(/listo|lista|dueño|dueña|bienvenido|bienvenida/);
  });

  it('describes the choice with the existing registered-agent product copy', () => {
    expect(en.wizard.addOnDesc_registered_agent).toBe(
      'Year-1 free. In-state physical address provided, legal mail scanned, your home address kept off the public record.',
    );
    expect(es.wizard.addOnDesc_registered_agent).toBe(
      'Año 1 gratis. Dirección física en el estado proporcionada, correo legal escaneado y tu dirección personal queda fuera del registro público.',
    );
    const step = source('components/wizard/steps/Step4Address.tsx');
    expect(step).toContain("t('addOnName_registered_agent')");
    expect(step).toContain("t('addOnDesc_registered_agent')");
    expect(step).toContain("t('useOurAgentP1'");
    expect(step).toContain("t('useOurAgentP2')");
    expect(step).toContain("t('useOurAgentP3'");
    expect(step).toContain("t('useOurAgentP4')");
    expect(step).not.toContain('floridaOnly');
    expect(step).not.toContain('lockedStateCode');
    expect(step).toContain('no_florida_address: noFloridaAddress');
    expect(source('components/wizard/useWizardSubmit.ts')).toContain(
      "trackEvent('wizard_step_completed'",
    );
    expect(source('components/wizard/steps/Step6RegisteredAgent.tsx')).toContain(
      'choseNoInStateAddress ? true',
    );
  });
});
