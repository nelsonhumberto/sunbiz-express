import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('legacy login redirects', () => {
  it('sends /login and /es/login to the sign-in page that exists', () => {
    const config = readFileSync('next.config.js', 'utf8');
    expect(config).toContain("{ source: '/login', destination: '/sign-in', permanent: true }");
    expect(config).toContain(
      "{ source: '/es/login', destination: '/es/sign-in', permanent: true }",
    );
    const page = readFileSync('app/(auth)/sign-in/page.tsx', 'utf8');
    expect(page).toContain('SignInForm');
    expect(page).not.toContain("redirect('/login')");
  });
});
