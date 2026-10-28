import { expect, test, devices } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3333';

test.use({
  ...devices['Pixel 5'],
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  hasTouch: true,
  baseURL: base,
});

test('Choose Essential navigates to /start?tier=BASIC on an Android touch', async ({ page }) => {
  await page.goto('/pricing?utm_source=google&gclid=androidtap');
  const essential = page.getByRole('link', { name: 'Choose Essential' });
  await essential.scrollIntoViewIfNeeded();
  await essential.tap();
  await expect(page).toHaveURL(/\/start\?/);
  const url = new URL(page.url());
  expect(url.pathname).toBe('/start');
  expect(url.searchParams.get('tier')).toBe('BASIC');
  expect(url.searchParams.get('utm_source')).toBe('google');
  expect(url.searchParams.get('gclid')).toBe('androidtap');
});
