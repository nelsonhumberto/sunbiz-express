import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BEFORE_NAVIGATION_CAPTURE,
  captureThenNavigate,
  flushAnalyticsBeforeNavigation,
  NAVIGATION_FLUSH_MAX_MS,
  navigationFlushBudget,
  posthogCaptureOptions,
  startNavigationEvents,
  trackEvent,
  wizardEntitySelectedProperties,
  wizardStep1ContinueProperties,
} from '@/lib/analytics';

const posthog = vi.hoisted(() => ({
  __loaded: false,
  capture: vi.fn(),
  flush: vi.fn(() => Promise.resolve()),
  config: { api_transport: 'fetch' as string | undefined },
  _requestQueue: { unload: vi.fn() },
  _retryQueue: { unload: vi.fn() },
}));

vi.mock('posthog-js', () => ({ default: posthog }));

const CHECKOUT_KEYS = ['filing_id', 'plan', 'amount', 'locale', 'is_test'] as const;
const FORBIDDEN_KEYS = ['email', 'name', 'businessName', 'business_name', 'firstName', 'lastName'];

function installBrowser(options?: { beacon?: boolean }) {
  vi.stubGlobal('window', { location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('navigator', options?.beacon === false ? {} : { sendBeacon: vi.fn() });
}

describe('start navigation event properties', () => {
  it('keeps the checkout allowlist and adds the formation type only on entity selected', () => {
    for (const locale of ['en', 'es'] as const) {
      const events = startNavigationEvents({
        filingId: 'filing_1',
        locale,
        entity: locale === 'es' ? 'CORP' : 'LLC',
      });
      expect(events.map((item) => item.event)).toEqual([
        'wizard_entity_selected',
        'start_name_submitted',
        'wizard_step1_continue_clicked',
      ]);
      expect(events[0]?.properties).toEqual({
        filing_id: 'filing_1',
        locale,
        entity: locale === 'es' ? 'CORP' : 'LLC',
      });
      expect(events[1]?.properties).toEqual({ filing_id: 'filing_1', locale });
      expect(events[2]?.properties).toEqual({ filing_id: 'filing_1', locale });
      for (const item of events) {
        for (const key of FORBIDDEN_KEYS) {
          expect(item.properties).not.toHaveProperty(key);
        }
        for (const key of Object.keys(item.properties)) {
          expect([...CHECKOUT_KEYS, 'entity']).toContain(key);
        }
      }
      expect(Object.keys(events[1]?.properties ?? {})).not.toContain('entity');
      expect(Object.keys(events[2]?.properties ?? {})).not.toContain('entity');
    }

    expect(
      wizardEntitySelectedProperties({
        filingId: 'filing_1',
        locale: 'en',
        entity: 'SCORP',
      }),
    ).toEqual({ filing_id: 'filing_1', locale: 'en', entity: 'SCORP' });
    expect(
      wizardEntitySelectedProperties({
        filingId: 'filing_1',
        locale: 'en',
        entity: 'Sol Norte',
      }),
    ).toEqual({ filing_id: 'filing_1', locale: 'en' });
    expect(
      wizardEntitySelectedProperties({
        filingId: 'filing_1',
        locale: 'en',
        entity: 'ada@example.com',
      }),
    ).not.toHaveProperty('entity');
    expect(wizardStep1ContinueProperties({ filingId: 'filing_1', locale: 'es' })).toEqual({
      filing_id: 'filing_1',
      locale: 'es',
    });
  });

  it('places the /start captures before the full-page navigation', () => {
    const launch = readFileSync('app/start/guest-start-launch.tsx', 'utf8');
    const captureAt = launch.indexOf('await captureThenNavigate');
    const assignAt = launch.indexOf('window.location.assign(href)');
    expect(captureAt).toBeGreaterThan(-1);
    expect(assignAt).toBeGreaterThan(captureAt);
    expect(launch).toContain('startNavigationEvents({ filingId, locale, entity })');
    expect(launch).not.toMatch(/if\s*\(\s*locale/);
  });
});

describe('capture options and navigation order', () => {
  beforeEach(() => {
    posthog.__loaded = false;
    posthog.capture.mockReset();
    posthog.flush.mockReset();
    posthog.flush.mockImplementation(() => Promise.resolve());
    posthog.config.api_transport = 'fetch';
    posthog._requestQueue.unload.mockReset();
    posthog._retryQueue.unload.mockReset();
    installBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('builds send_instantly and sendBeacon options for a navigation capture', () => {
    expect(posthogCaptureOptions(BEFORE_NAVIGATION_CAPTURE)).toEqual({
      send_instantly: true,
      transport: 'sendBeacon',
    });
    expect(posthogCaptureOptions({ sendInstantly: true })).toEqual({ send_instantly: true });
    expect(posthogCaptureOptions()).toBeUndefined();
    expect(navigationFlushBudget(undefined)).toBe(NAVIGATION_FLUSH_MAX_MS);
    expect(navigationFlushBudget(5_000)).toBe(NAVIGATION_FLUSH_MAX_MS);
    expect(navigationFlushBudget(120)).toBe(120);
    expect(navigationFlushBudget(0)).toBe(0);
    expect(navigationFlushBudget(Number.NaN)).toBe(NAVIGATION_FLUSH_MAX_MS);
  });

  it('does not call PostHog or wait when PostHog is not loaded', async () => {
    vi.useFakeTimers();
    posthog.__loaded = false;
    const order: string[] = [];
    let navigated = false;
    const pending = captureThenNavigate({
      events: startNavigationEvents({ filingId: 'filing_1', locale: 'en', entity: 'LLC' }),
      navigate: () => {
        order.push('navigate');
        navigated = true;
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(navigated).toBe(true);
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.flush).not.toHaveBeenCalled();
    expect(order).toEqual(['navigate']);
    await pending;
  });

  it('captures with send_instantly and sendBeacon before navigating', async () => {
    posthog.__loaded = true;
    const order: string[] = [];
    posthog.capture.mockImplementation((event: string) => {
      order.push(`capture:${event}`);
      order.push(`transport:${posthog.config.api_transport}`);
    });
    posthog._requestQueue.unload.mockImplementation(() => {
      order.push('unload-queue');
    });
    posthog._retryQueue.unload.mockImplementation(() => {
      order.push('unload-retry');
    });
    posthog.flush.mockImplementation(() => new Promise(() => undefined));

    await captureThenNavigate({
      events: startNavigationEvents({ filingId: 'filing_1', locale: 'es', entity: 'LLC' }),
      navigate: () => {
        order.push('navigate');
      },
    });

    expect(order).toEqual([
      'capture:wizard_entity_selected',
      'transport:sendBeacon',
      'capture:start_name_submitted',
      'transport:sendBeacon',
      'capture:wizard_step1_continue_clicked',
      'transport:sendBeacon',
      'unload-queue',
      'unload-retry',
      'navigate',
    ]);
    expect(posthog.config.api_transport).toBe('fetch');
    expect(posthog.flush).not.toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenNthCalledWith(
      1,
      'wizard_entity_selected',
      { filing_id: 'filing_1', locale: 'es', entity: 'LLC' },
      { send_instantly: true, transport: 'sendBeacon' },
    );
    expect(posthog.capture).toHaveBeenNthCalledWith(
      2,
      'start_name_submitted',
      { filing_id: 'filing_1', locale: 'es' },
      { send_instantly: true, transport: 'sendBeacon' },
    );
    expect(posthog.capture).toHaveBeenNthCalledWith(
      3,
      'wizard_step1_continue_clicked',
      { filing_id: 'filing_1', locale: 'es' },
      { send_instantly: true, transport: 'sendBeacon' },
    );
    for (const call of posthog.capture.mock.calls) {
      const properties = call[1] as Record<string, unknown>;
      for (const key of FORBIDDEN_KEYS) {
        expect(properties).not.toHaveProperty(key);
      }
    }
  });

  it('still navigates when one capture throws', async () => {
    posthog.__loaded = true;
    const order: string[] = [];
    posthog.capture
      .mockImplementationOnce(() => {
        throw new Error('capture failed');
      })
      .mockImplementation((event: string) => {
        order.push(event);
      });

    await captureThenNavigate({
      events: startNavigationEvents({ filingId: 'filing_1', locale: 'en', entity: 'CORP' }),
      navigate: () => {
        order.push('navigate');
      },
    });

    expect(order).toEqual(['start_name_submitted', 'wizard_step1_continue_clicked', 'navigate']);
    expect(posthog.config.api_transport).toBe('fetch');
  });

  it('waits at most 300ms for a flush when sendBeacon is unavailable', async () => {
    vi.useFakeTimers();
    installBrowser({ beacon: false });
    posthog.__loaded = true;
    posthog.flush.mockImplementation(() => new Promise(() => undefined));
    const order: string[] = [];
    posthog.capture.mockImplementation((event: string) => {
      order.push(`capture:${event}`);
      order.push(`transport:${posthog.config.api_transport}`);
    });
    let navigated = false;
    const pending = captureThenNavigate({
      events: [{ event: 'start_name_submitted', properties: { filing_id: 'filing_1', locale: 'en' } }],
      navigate: () => {
        order.push('navigate');
        navigated = true;
      },
      maxWaitMs: 5_000,
    });

    await vi.advanceTimersByTimeAsync(299);
    expect(navigated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(navigated).toBe(true);
    expect(order[0]).toBe('capture:start_name_submitted');
    expect(order.at(-1)).toBe('navigate');
    expect(order.indexOf('capture:start_name_submitted')).toBeLessThan(order.indexOf('navigate'));
    expect(posthog.capture).toHaveBeenCalledWith(
      'start_name_submitted',
      { filing_id: 'filing_1', locale: 'en' },
      { send_instantly: true, transport: 'sendBeacon' },
    );
    expect(posthog.config.api_transport).toBe('fetch');
    await pending;
  });

  it('returns immediately from a flush when PostHog is not loaded', async () => {
    vi.useFakeTimers();
    posthog.__loaded = false;
    let settled = false;
    const pending = flushAnalyticsBeforeNavigation(5_000).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(posthog.flush).not.toHaveBeenCalled();
    await pending;
  });

  it('passes navigation options through trackEvent', () => {
    posthog.__loaded = true;
    trackEvent('start_name_submitted', { filing_id: 'filing_1', locale: 'en' }, BEFORE_NAVIGATION_CAPTURE);
    expect(posthog.capture).toHaveBeenCalledWith(
      'start_name_submitted',
      { filing_id: 'filing_1', locale: 'en' },
      { send_instantly: true, transport: 'sendBeacon' },
    );
  });
});
