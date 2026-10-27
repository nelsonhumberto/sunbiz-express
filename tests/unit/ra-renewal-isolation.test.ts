import { describe, expect, it } from 'vitest';
import { FORMATION_STATES } from '@/lib/formation-states';

describe('formation-states renewal price without pricing imported', () => {
  it('reads Florida renewalCents as 15000 from the leaf module', () => {
    expect(FORMATION_STATES.FL.registeredAgent.renewalCents).toBe(15_000);
    expect(FORMATION_STATES.WY.registeredAgent.renewalCents).toBe(11_900);
    expect(FORMATION_STATES.DE.registeredAgent.renewalCents).toBe(14_900);
  });
});
