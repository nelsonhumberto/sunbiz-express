import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('wizard Continue clears the cookie banner', () => {
  it('offsets the bottom action bar by the open banner height', () => {
    const shell = source('components/wizard/WizardShell.tsx');
    const actions = shell.slice(shell.indexOf('export function WizardActions'));
    expect(actions).toContain('sticky');
    expect(actions).toContain("bottom: 'var(--lf-cookie-h, 0px)'");
    expect(actions).not.toContain('bottom-0');
    expect(shell).toContain('pb-[var(--lf-cookie-h,0px)]');
    const bar = source('components/analytics/CookieConsentBar.tsx');
    expect(bar).toContain("const COOKIE_BAR_VAR = '--lf-cookie-h'");
    expect(bar).toContain('fixed inset-x-0 bottom-0');
    expect(bar).toContain('shouldShowCookieNotice');
    expect(bar).toContain('serializeAdsConsentCookie');
  });
});

describe('Spanish landing sticky and repeat labels', () => {
  it('matches the hero and stays informal', () => {
    expect(es.lpFlorida.stickyCta).toBe('Empezar mi LLC en Florida');
    expect(es.lpFlorida.repeatCta).toBe('Empezar mi LLC en Florida');
    expect(es.lpFlorida.startButton).toBe(es.lpFlorida.stickyCta);
    expect(es.lpFlorida.repeatCta).not.toMatch(/\u2014|\u2013/);
    expect(es.lpFlorida.stickyCta).not.toMatch(/\b(listo|lista|bienvenido|bienvenida)\b/i);
    expect(en.lpFlorida.stickyCta).toBe('Start with your company name');
    expect(en.lpFlorida.repeatCta).toBe('Start your Florida LLC');
  });
});
