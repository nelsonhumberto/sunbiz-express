import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const headerGet = vi.hoisted(() => vi.fn((_name: string) => null as string | null));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: () => ({ get: (name: string) => headerGet(name) }),
}));

import { checkActionRateLimit } from '@/lib/rate-limit';

function setForwardedFor(value: string | null) {
  headerGet.mockImplementation((name: string) => (name === 'x-forwarded-for' ? value : null));
}

describe('guest-open rate limit', () => {
  beforeEach(() => {
    headerGet.mockReset();
  });

  it('is per IP, so one address cannot use up the bucket for another', () => {
    const hour = 60 * 60 * 1000;
    setForwardedFor('198.51.100.41, 10.0.0.1');
    expect(checkActionRateLimit('guest-open', 2, hour)).toBeNull();
    expect(checkActionRateLimit('guest-open', 2, hour)).toBeNull();
    expect(checkActionRateLimit('guest-open', 2, hour)).toMatch(/Too many attempts/);

    setForwardedFor('198.51.100.42');
    expect(checkActionRateLimit('guest-open', 2, hour)).toBeNull();
  });

  it('counts the client address, not the proxy listed after it', () => {
    const hour = 60 * 60 * 1000;
    setForwardedFor('203.0.113.8, 203.0.113.9');
    expect(checkActionRateLimit('guest-open-proxy', 1, hour)).toBeNull();
    setForwardedFor('203.0.113.9');
    expect(checkActionRateLimit('guest-open-proxy', 1, hour)).toBeNull();
    setForwardedFor('203.0.113.8, 198.51.100.1');
    expect(checkActionRateLimit('guest-open-proxy', 1, hour)).toMatch(/Too many attempts/);
  });

  it('keeps the guest-open call on the shared per-IP helper', () => {
    const source = readFileSync('actions/guest-start.ts', 'utf8');
    expect(source).toContain("checkActionRateLimit('guest-open', 30, 60 * 60 * 1000)");
    const limiter = readFileSync('lib/rate-limit.ts', 'utf8');
    expect(limiter).toContain('const key = `${scope}:${ip}');
    expect(limiter).toContain("return value.split(',')[0]?.trim() ?? ''");
    expect(limiter).toContain("firstHop(h.get('x-forwarded-for'))");
  });
});
