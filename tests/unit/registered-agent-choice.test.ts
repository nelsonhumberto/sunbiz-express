import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addressStepCompletedProperties,
  initialUseOurRegisteredAgent,
} from '@/lib/registered-agent-choice';

describe('saved registered agent choice', () => {
  it('defaults to our agent only when no agent has been saved', () => {
    expect(initialUseOurRegisteredAgent(undefined)).toBe(true);
    expect(initialUseOurRegisteredAgent(null)).toBe(true);
  });

  it('keeps a saved own-agent choice and does not overwrite it', () => {
    expect(initialUseOurRegisteredAgent(false)).toBe(false);
    expect(initialUseOurRegisteredAgent(true)).toBe(true);
    const step = readFileSync('components/wizard/steps/Step6RegisteredAgent.tsx', 'utf8');
    expect(step).toContain('initialUseOurRegisteredAgent(stored?.useOurService)');
    expect(step).not.toContain('choseNoInStateAddress ? true');
  });
});

describe('address step trackEvent props', () => {
  it('puts no_florida_address on Florida address-step completions', () => {
    expect(addressStepCompletedProperties('FL', true)).toEqual({ no_florida_address: true });
    expect(addressStepCompletedProperties('FL', false)).toEqual({ no_florida_address: false });
    expect(addressStepCompletedProperties('WY', true)).toEqual({ no_in_state_address: true });
    expect(addressStepCompletedProperties('WY', false)).toEqual({ no_in_state_address: false });
    expect(addressStepCompletedProperties('WY', true)).not.toHaveProperty('no_florida_address');

    const step = readFileSync('components/wizard/steps/Step4Address.tsx', 'utf8');
    const submit = readFileSync('components/wizard/useWizardSubmit.ts', 'utf8');
    expect(step).toContain('addressStepCompletedProperties(filingState, noFloridaAddress)');
    expect(submit).toContain("trackEvent('wizard_step_completed'");
    expect(submit).toContain('...eventProperties');
  });
});
