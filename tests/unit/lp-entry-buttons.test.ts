import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lpSurfaceOpensShortWizard } from '@/lib/lp-wizard-path';
import { tierPackagePriceCents } from '@/lib/pricing';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Florida LLC landing entry buttons', () => {
  it('keeps the short wizard on the ad landing and the 11-step flow everywhere else', () => {
    expect(lpSurfaceOpensShortWizard('/lp/florida-llc')).toBe(true);
    expect(lpSurfaceOpensShortWizard('/es/lp/llc-florida')).toBe(true);
    expect(lpSurfaceOpensShortWizard('/es/lp/llc-florida?utm_source=google&tier=PREMIUM')).toBe(true);
    expect(lpSurfaceOpensShortWizard('/start')).toBe(false);
    expect(lpSurfaceOpensShortWizard('/es/start')).toBe(false);
    expect(lpSurfaceOpensShortWizard('/pricing')).toBe(false);
    expect(lpSurfaceOpensShortWizard('/es/pricing')).toBe(false);
    expect(lpSurfaceOpensShortWizard('/')).toBe(false);
  });

  it('sends the header Start Filing control into the landing form, not /start', () => {
    const nav = source('components/marketing/NavBar.tsx');
    expect(nav).toContain('lpSurfaceOpensShortWizard(pathname)');
    expect(nav).toContain("document.querySelector<HTMLFormElement>('[data-testid=\"lp-hero\"] form')");
    expect(nav).toContain('requestSubmit()');
    expect(nav).toContain("'/start'");
    const branch = nav.indexOf('shortWizard ?');
    const desktop = nav.indexOf("submitLandingStart('nav_start')");
    const fallback = nav.indexOf('href={startHref}');
    expect(branch).toBeGreaterThan(-1);
    expect(desktop).toBeGreaterThan(branch);
    expect(fallback).toBeGreaterThan(desktop);
  });

  it('opens each plan button as a short draft for that tier', () => {
    const landing = source('components/marketing/FloridaLlcLanding.tsx');
    expect(landing).toContain(
      "openDraft(tier.slug, trimmed, 'plan', !startNameIsAcceptable(trimmed))",
    );
    expect(landing).toContain('submitFloridaLlcLanding');
    expect(landing).not.toContain('function startHref');
    expect(landing).not.toContain('/start?');
    const pricing = source('components/marketing/PricingTable.tsx');
    expect(pricing).toContain('`/start?tier=${tier.slug}');
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(19_900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(34_900);
  });
});
