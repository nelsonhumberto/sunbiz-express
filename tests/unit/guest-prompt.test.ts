import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guestPromptDelayMs, shouldShowGuestAccountPrompt } from '@/lib/guest-prompt';

describe('guest save-progress prompt', () => {
  it('waits 45 seconds for organic guests and ad guests', () => {
    expect(guestPromptDelayMs()).toBe(45_000);
    const prompt = readFileSync('components/wizard/GuestAccountPrompt.tsx', 'utf8');
    expect(prompt).toContain('guestPromptDelayMs()');
    expect(prompt).not.toContain('1_200');
    expect(prompt).not.toContain('isAdTraffic');
  });

  it('stays off the package step and off the landing wizard', () => {
    expect(
      shouldShowGuestAccountPrompt({ isGuest: true, lpShort: false, hasEmail: true, step: 2 }),
    ).toBe(true);
    expect(
      shouldShowGuestAccountPrompt({ isGuest: true, lpShort: false, hasEmail: true, step: 3 }),
    ).toBe(false);
    expect(
      shouldShowGuestAccountPrompt({ isGuest: true, lpShort: false, hasEmail: true, step: 4 }),
    ).toBe(true);
    expect(
      shouldShowGuestAccountPrompt({ isGuest: true, lpShort: true, hasEmail: true, step: 4 }),
    ).toBe(false);
    expect(
      shouldShowGuestAccountPrompt({ isGuest: false, lpShort: false, hasEmail: true, step: 4 }),
    ).toBe(false);
    const page = readFileSync('app/wizard/[filingId]/[step]/page.tsx', 'utf8');
    expect(page).toContain('shouldShowGuestAccountPrompt');
    expect(page).toContain('lpShort');
  });
});
