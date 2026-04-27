'use server';

// Server action backing the non-Florida waitlist form. Validates the email
// and state on the server, dedupes per (email, state), and never blocks the
// Florida filing flow. Out of scope here:
//   - Sending real emails (we just persist the lead)
//   - Storing IP / user agent (deliberately omitted to minimise PII)
//
// Note: the `MarketingLead` table must exist in the database before this
// action can write. After updating the schema, run `npm run db:migrate` (or
// `npm run db:push` in development) to apply the migration.

import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  ALL_MARKETING_STATES,
  resolveMarketingState,
} from '@/lib/marketing-states';

const VALID_STATE_CODES = new Set(ALL_MARKETING_STATES.map((s) => s.code));

const SUPPORTED_LOCALES = new Set(['en', 'es']);

const LeadInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254),
  state: z.string().trim().min(1).max(64),
  locale: z.string().trim().min(2).max(8).optional(),
  source: z.string().trim().max(64).optional(),
  campaign: z.string().trim().max(64).optional(),
  // Honeypot field; real users never fill this. Keep param last so legitimate
  // form submissions never accidentally collide with it.
  website: z.string().optional(),
});

export type CaptureLeadResult =
  | { ok: true }
  | {
      ok: false;
      error: 'invalid-email' | 'invalid-state' | 'duplicate' | 'generic';
    };

export async function captureMarketingLead(
  input: z.input<typeof LeadInput>,
): Promise<CaptureLeadResult> {
  // Drop honeypot submissions silently — bots see a 200, real users do not
  // hit this branch because the field is `display: none` and unlabelled.
  if (input.website && input.website.trim().length > 0) {
    return { ok: true };
  }

  const parsed = LeadInput.safeParse(input);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find((i) => i.path[0] === 'email');
    if (emailIssue) return { ok: false, error: 'invalid-email' };
    return { ok: false, error: 'invalid-state' };
  }

  const { email, state, locale, source, campaign } = parsed.data;

  const resolved = resolveMarketingState(state);
  // We only collect leads for non-active (coming_soon) states. Florida
  // visitors should be funnelled into the wizard, not the waitlist.
  if (resolved.availability !== 'coming_soon') {
    return { ok: false, error: 'invalid-state' };
  }
  if (!VALID_STATE_CODES.has(resolved.code)) {
    return { ok: false, error: 'invalid-state' };
  }

  const safeLocale = locale && SUPPORTED_LOCALES.has(locale) ? locale : 'en';

  try {
    await prisma.marketingLead.create({
      data: {
        email,
        state: resolved.code,
        locale: safeLocale,
        source: source?.slice(0, 64) || null,
        campaign: campaign?.slice(0, 64) || null,
      },
    });
    return { ok: true };
  } catch (err: unknown) {
    // Prisma P2002 = unique constraint violation. We treat that as a soft
    // success at the UI layer (user is already on the list).
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return { ok: false, error: 'duplicate' };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('[captureMarketingLead] failed', err);
    }
    return { ok: false, error: 'generic' };
  }
}
