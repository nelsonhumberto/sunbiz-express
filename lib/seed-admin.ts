import crypto from 'crypto';

/** Default admin email when SEED_ADMIN_EMAIL is unset. */
export const DEFAULT_SEED_ADMIN_EMAIL = 'laura@launchforma.com';

/**
 * Admin credentials for local/dev seeding.
 * SEED_ADMIN_PASSWORD is never committed. When it is missing we mint a
 * random password the caller must print once.
 */
export function resolveSeedAdminCredentials(): {
  email: string;
  password: string;
  generated: boolean;
} {
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || DEFAULT_SEED_ADMIN_EMAIL;
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length > 0) {
    return { email, password: fromEnv, generated: false };
  }
  return {
    email,
    password: crypto.randomBytes(18).toString('base64url'),
    generated: true,
  };
}
