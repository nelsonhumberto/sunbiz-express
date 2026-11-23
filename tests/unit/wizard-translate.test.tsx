/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTranslateDomGuard } from '@/lib/translate-dom-guard';

const saveStep2 = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const saveStep4 = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/wizard/fil_1/2',
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement('a', { href }, children),
}));
vi.mock('@/actions/wizard', () => ({
  saveStep2,
  saveStep4,
}));
vi.mock('@/actions/guest-start', () => ({
  claimGuestAccount: vi.fn(),
}));
vi.mock('@/actions/locale', () => ({
  setLocaleAction: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  preselectedEventProps: () => ({}),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { Step2Name } from '@/components/wizard/steps/Step2Name';
import { Step4Address } from '@/components/wizard/steps/Step4Address';
import type { WizardFiling } from '@/components/wizard/types';

function filing(step: 2 | 4): WizardFiling {
  return {
    id: 'fil_1',
    locale: 'en',
    state: 'FL',
    entityType: 'LLC',
    businessName: step === 2 ? 'Northwind LLC' : '',
    principalAddress:
      step === 4
        ? JSON.stringify({ street1: '1 Main St', city: 'Miami', state: 'FL', zip: '33101' })
        : null,
    serviceTier: 'BASIC',
    taxElection: null,
    managersMembers: [],
    filingAdditionalServices: [],
  } as unknown as WizardFiling;
}

function wrapTextInFont(root: ParentNode) {
  // Chrome still wraps text when translate="no" or .notranslate is set and the
  // visitor has "always translate English" on. Do not skip those nodes.
  const texts: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    texts.push(current as Text);
    current = walker.nextNode();
  }
  for (const text of texts) {
    const parent = text.parentNode;
    if (!parent || parent.nodeName === 'FONT') continue;
    if (!text.textContent?.trim()) continue;
    const font = document.createElement('font');
    parent.insertBefore(font, text);
    font.appendChild(text);
  }
}

function polyfillPointerCapture() {
  const proto = Element.prototype as Element & {
    hasPointerCapture?: (id: number) => boolean;
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
  };
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
}

describe('wizard steps survive Chrome Translate', () => {
  let root: Root;
  let host: HTMLDivElement;
  let crashes: string[];
  let consoleError: typeof console.error;

  beforeEach(() => {
    polyfillPointerCapture();
    installTranslateDomGuard();
    saveStep2.mockClear();
    saveStep4.mockClear();
    saveStep2.mockResolvedValue({ ok: true });
    saveStep4.mockResolvedValue({ ok: true });
    crashes = [];
    consoleError = console.error;
    console.error = (...args: unknown[]) => {
      const text = args.map((item) => (item instanceof Error ? item.message : String(item))).join(' ');
      if (/NotFoundError|insertBefore|removeChild/.test(text)) crashes.push(text);
      consoleError(...args);
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            query: 'Northwind LLC',
            available: true,
            status: 'available',
            message: 'No conflicts',
            conflicts: [],
            suggestions: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    console.error = consoleError;
    vi.unstubAllGlobals();
  });

  it('keeps step 2 alive when text nodes are wrapped in font, including the legal ending menu', async () => {
    await act(async () => {
      root.render(createElement(Step2Name, { filing: filing(2) }));
    });
    host.setAttribute('translate', 'no');
    host.classList.add('notranslate');
    const meta = document.createElement('meta');
    meta.name = 'google';
    meta.content = 'notranslate';
    document.head.appendChild(meta);
    wrapTextInFont(host);
    expect(host.querySelector('font')).toBeTruthy();
    const input = host.querySelector('#businessName') as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Harbor');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    wrapTextInFont(host);
    const trigger = host.querySelector('#businessSuffix') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      trigger.click();
    });
    wrapTextInFont(document.body);
    const option = document.body.querySelector('[role="option"]');
    if (option) {
      await act(async () => {
        option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        (option as HTMLElement).click();
      });
    }
    const button = [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('continue'),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });
    expect(crashes).toEqual([]);
    expect(saveStep2).toHaveBeenCalled();
  });

  it('keeps step 4 alive when text nodes are wrapped in font and Continue still saves', async () => {
    await act(async () => {
      root.render(createElement(Step4Address, { filing: filing(4) }));
    });
    host.setAttribute('translate', 'no');
    host.classList.add('notranslate');
    wrapTextInFont(host);
    expect(host.querySelector('font')).toBeTruthy();
    const radios = host.querySelectorAll('[role="radio"]');
    expect(radios.length).toBeGreaterThan(0);
    await act(async () => {
      (radios[1] as HTMLElement).click();
    });
    wrapTextInFont(host);
    await act(async () => {
      (radios[0] as HTMLElement).click();
    });
    const button = [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('continue'),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });
    expect(crashes).toEqual([]);
    expect(saveStep4).toHaveBeenCalled();
  });
});
