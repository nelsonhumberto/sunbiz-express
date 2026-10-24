import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isInternalTrafficUser } from '@/lib/internal-traffic';

describe('internal PostHog traffic', () => {
  it('flags admins and the launchforma.com domain only', () => {
    expect(isInternalTrafficUser({ role: 'ADMIN', email: 'buyer@example.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'Ada@LaunchForma.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@launchforma.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@sub.launchforma.com' })).toBe(false);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@launchforma.com.evil' })).toBe(false);
    expect(isInternalTrafficUser({ role: 'USER', email: 'not-an-email' })).toBe(false);
    expect(isInternalTrafficUser(null)).toBe(false);
  });

  it('registers is_internal and sets the person property for those sessions', () => {
    const analytics = readFileSync('lib/analytics.ts', 'utf8');
    expect(analytics).toContain('client.register({ is_internal: true })');
    expect(analytics).toContain('client.identify(userId, traits)');
    expect(analytics).toContain('is_internal: true');
    expect(analytics).toContain('client.setPersonProperties?.({ is_internal: true })');

    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain('isInternalTrafficUser');
    expect(layout).toContain('<InternalTrafficFlag');
  });
});
