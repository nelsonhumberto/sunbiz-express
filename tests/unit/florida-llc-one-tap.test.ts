import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEFORE_NAVIGATION_CAPTURE, trackCtaClicked } from '@/lib/analytics';
import { startNameIsAcceptable } from '@/lib/start-draft';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const posthog = vi.hoisted(() => ({
  __loaded: true,
  capture: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: posthog }));

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function functionBody(file: string, signature: string): string {
  const start = file.indexOf(signature);
  if (start < 0) throw new Error(`missing ${signature}`);
  const open = file.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < file.length; i += 1) {
    const char = file[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return file.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${signature}`);
}

function between(file: string, startMarker: string, endMarker: string): string {
  const start = file.indexOf(startMarker);
  const end = file.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`missing slice ${startMarker} -> ${endMarker}`);
  return file.slice(start, end);
}

describe('Florida LLC landing one tap', () => {
  const landing = source('components/marketing/FloridaLlcLanding.tsx');
  const onSubmit = functionBody(landing, 'function onSubmit');
  const openDraft = functionBody(landing, 'async function openDraft');
  const sticky = between(landing, 'data-testid="lp-sticky"', "tLp('stickyCta')");
  const repeat = between(landing, 'className="flex h-12 w-full', "tLp('repeatCta')");
  const plan = between(landing, 'href={startHref(tier.slug, name)}', "tPricing('chooseTier'");

  it('empty name submits to nameLater draft', () => {
    expect(startNameIsAcceptable('')).toBe(false);
    expect(startNameIsAcceptable('   ')).toBe(false);
    expect(startNameIsAcceptable('A LLC')).toBe(false);
    expect(startNameIsAcceptable('Northwind')).toBe(true);
    expect(onSubmit).toContain('if (!startNameIsAcceptable(trimmed))');
    expect(onSubmit).toContain("openDraft(tier, trimmed, 'hero', true)");
    expect(onSubmit).toContain("openDraft(tier, trimmed, 'hero')");
    expect(onSubmit).toContain('tierForStart()');
    expect(onSubmit).not.toContain('companyNameInvalid');
    expect(onSubmit).not.toContain('setError');
    expect(openDraft).toContain('const skipName = deferName && !startNameIsAcceptable(trimmed)');
    expect(openDraft).toContain('nameLater: skipName');
    expect(openDraft).toContain('businessName: skipName ? undefined : trimmed');
    expect(landing).not.toContain('focusName');
    expect(landing).not.toContain("t('nameLater')");
    expect(landing).not.toContain('lp-name-later');
    expect(landing).toContain("tLp('nameOptional')");
    expect(en.lpFlorida.nameOptional).toBe('(optional)');
    expect(es.lpFlorida.nameOptional).toBe('(opcional)');
  });

  it('sticky CTA opens draft', () => {
    expect(sticky).toContain("openDraft(tier, name, 'sticky', !startNameIsAcceptable(name))");
    expect(sticky).not.toContain('focusName');
    expect(sticky).not.toContain('scrollIntoView');
    expect(repeat).toContain("openDraft(tier, name, 'repeat', !startNameIsAcceptable(name))");
    expect(repeat).not.toContain('focusName');
    expect(landing).not.toContain('focusName()');
  });

  it('cta_clicked fires before validation', () => {
    expect(onSubmit.indexOf('trackCtaClicked')).toBeGreaterThan(-1);
    expect(onSubmit.indexOf('trackCtaClicked')).toBeLessThan(onSubmit.indexOf('startNameIsAcceptable'));
    expect(onSubmit.indexOf('BEFORE_NAVIGATION_CAPTURE')).toBeLessThan(onSubmit.indexOf('startNameIsAcceptable'));
    expect(onSubmit).toContain("location: 'hero'");
    expect(onSubmit).toContain('has_name: name.trim().length > 0');

    expect(sticky.indexOf('trackCtaClicked')).toBeLessThan(sticky.indexOf('startNameIsAcceptable'));
    expect(sticky.indexOf('BEFORE_NAVIGATION_CAPTURE')).toBeLessThan(sticky.indexOf('startNameIsAcceptable'));
    expect(sticky).toContain("location: 'sticky'");
    expect(sticky).toContain('has_name:');

    expect(repeat.indexOf('trackCtaClicked')).toBeLessThan(repeat.indexOf('startNameIsAcceptable'));
    expect(repeat).toContain('BEFORE_NAVIGATION_CAPTURE');
    expect(repeat).toContain("location: 'repeat'");

    expect(plan.indexOf('trackCtaClicked')).toBeLessThan(plan.indexOf('startNameIsAcceptable'));
    expect(plan.indexOf('BEFORE_NAVIGATION_CAPTURE')).toBeLessThan(plan.indexOf('startNameIsAcceptable'));
    expect(plan).toContain("location: 'plan'");
    expect(plan).toContain('has_name: name.trim().length > 0');

    expect(openDraft).not.toContain('trackCtaClicked');
    expect(landing.match(/'lp_continue'/g)).toHaveLength(4);

    vi.stubGlobal('window', { location: { search: '' } });
    vi.stubGlobal('document', { cookie: '' });
    posthog.__loaded = true;
    posthog.capture.mockClear();
    trackCtaClicked('lp_continue', { location: 'hero', has_name: false }, BEFORE_NAVIGATION_CAPTURE);
    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith(
      'cta_clicked',
      { cta_id: 'lp_continue', location: 'hero', has_name: false },
      { send_instantly: true, transport: 'sendBeacon' },
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  posthog.capture.mockReset();
});
