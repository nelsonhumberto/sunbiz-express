import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FORMATION_STATES, launchformaRaPhone } from '@/lib/formation-states';

const ORIGINAL = process.env.LAUNCHFORMA_RA_PHONE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.LAUNCHFORMA_RA_PHONE;
  else process.env.LAUNCHFORMA_RA_PHONE = ORIGINAL;
});

describe('registered agent phone', () => {
  it('is hidden when LAUNCHFORMA_RA_PHONE is unset', () => {
    delete process.env.LAUNCHFORMA_RA_PHONE;
    expect(launchformaRaPhone()).toBe('');
    expect(FORMATION_STATES.FL.registeredAgent.phone).toBe('');
    expect(FORMATION_STATES.WY.registeredAgent.phone).toBe('');
    expect(FORMATION_STATES.DE.registeredAgent.phone).toBe('');
    expect(FORMATION_STATES.FL.registeredAgent.street1).toContain('Palmetto');
    expect(FORMATION_STATES.FL.registeredAgent.name).toBe('LaunchForma LLC');
  });

  it('reads LAUNCHFORMA_RA_PHONE when set', () => {
    process.env.LAUNCHFORMA_RA_PHONE = '  +1 305 203 6762  ';
    expect(launchformaRaPhone()).toBe('+1 305 203 6762');
    expect(FORMATION_STATES.FL.registeredAgent.phone).toBe('+1 305 203 6762');
    expect(FORMATION_STATES.WY.registeredAgent.phone).toBe('+1 305 203 6762');
    expect(FORMATION_STATES.DE.registeredAgent.phone).toBe('+1 305 203 6762');
  });

  it('does not keep the placeholder 555 numbers in the agent profiles', () => {
    const states = readFileSync('lib/formation-states.ts', 'utf8');
    expect(states).not.toMatch(/555-0100|555-0150|555-0175/);

    const step6 = readFileSync('components/wizard/steps/Step6RegisteredAgent.tsx', 'utf8');
    expect(step6).toMatch(/internalAgent\.phone \?/);

    const pdf = readFileSync('lib/pdf.ts', 'utf8');
    expect(pdf).not.toMatch(/ra\?\.phone|ra\.phone|registeredAgent\.phone/);
  });
});
