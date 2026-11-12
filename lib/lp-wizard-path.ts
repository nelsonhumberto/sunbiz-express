/**
 * Short wizard for Florida LLC landing drafts only.
 * /start (including Google ads that open /start) and every CORP draft
 * keep the 11-step path. A missing entry path with the landing flag is
 * treated as the ad landing path. Pricing and /start are excluded when
 * that path was stored.
 */

import { isFloridaLlcLandingPath, pathnameOnly, readFloridaLlcPreselected } from '@/lib/florida-llc-preselect';
import { startNameIsAcceptable } from '@/lib/start-draft';

const START_PATHS = new Set(['/start', '/es/start']);
const PRICING_PATHS = new Set(['/pricing', '/es/pricing']);

/** URL steps the landing draft actually shows, in order. */
export const LP_SHORT_STEPS = [2, 4, 7, 9, 10, 11] as const;

export const LP_SHORT_TOTAL = LP_SHORT_STEPS.length;

export type LpProgress = {
  hasName: boolean;
  hasPrincipal: boolean;
  hasMailing: boolean;
  hasAgent: boolean;
  hasMember: boolean;
  hasSignature: boolean;
};

export function usesLpShortWizard(input: {
  optionalDetails?: string | null;
  entryPath?: string | null;
  entityType?: string | null;
}): boolean {
  if (input.entityType === 'CORP') return false;
  if (!readFloridaLlcPreselected(input.optionalDetails)) return false;
  const entry = pathnameOnly(input.entryPath);
  if (START_PATHS.has(entry) || PRICING_PATHS.has(entry)) return false;
  if (isFloridaLlcLandingPath(entry)) return true;
  return entry.length === 0;
}

export function lpProgressLabel(urlStep: number): { current: number; total: number } {
  const index = LP_SHORT_STEPS.indexOf(urlStep as (typeof LP_SHORT_STEPS)[number]);
  return { current: index >= 0 ? index + 1 : 1, total: LP_SHORT_TOTAL };
}

/** Earliest URL step that still owes Sunbiz-required data. Add-ons are not required. */
export function lpFurthestOpenStep(progress: LpProgress): number {
  if (!progress.hasName) return 2;
  if (!progress.hasPrincipal || !progress.hasMailing || !progress.hasAgent) return 4;
  if (!progress.hasMember) return 7;
  if (!progress.hasSignature) return 9;
  return 11;
}

/**
 * Where an LP draft should render. Skipped URL steps (tier, separate mailing,
 * separate agent, optional details) land on the short step that replaced them.
 * Payment never opens while a required field is still empty.
 */
export function lpRouteStep(requested: number, progress: LpProgress): number {
  const furthest = lpFurthestOpenStep(progress);
  const step = Number.isFinite(requested) ? Math.trunc(requested) : 2;

  if (step === 1) return 2;
  if (step === 3) return furthest < 4 ? 2 : 4;
  if (step === 5 || step === 6) return furthest < 7 ? 4 : 7;
  if (step === 8) {
    if (!progress.hasSignature) return furthest < 9 ? furthest : 9;
    return 10;
  }
  if (step === 10) return furthest >= 11 ? 10 : furthest;
  if (step === 11) return furthest >= 11 ? 11 : furthest;
  if ((LP_SHORT_STEPS as readonly number[]).includes(step)) {
    return step <= furthest ? step : furthest;
  }
  return furthest;
}

function readJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function addressFilled(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as { street1?: unknown; city?: unknown };
  return (
    typeof row.street1 === 'string' &&
    row.street1.trim().length > 0 &&
    typeof row.city === 'string' &&
    row.city.trim().length > 0
  );
}

export function lpProgressFromDraft(input: {
  businessName?: string | null;
  principalAddress?: string | null;
  mailingAddress?: string | null;
  registeredAgent?: string | null;
  memberNames?: Array<string | null | undefined>;
  incorporatorSignature?: string | null;
}): LpProgress {
  const mailing = readJson(input.mailingAddress);
  const agent = readJson(input.registeredAgent);
  let hasAgent = false;
  if (agent && typeof agent === 'object') {
    const row = agent as { useOurService?: unknown; name?: unknown; street1?: unknown };
    const named =
      typeof row.name === 'string' &&
      row.name.trim().length > 0 &&
      typeof row.street1 === 'string' &&
      row.street1.trim().length > 0;
    hasAgent = row.useOurService === true || named;
  }
  return {
    hasName: startNameIsAcceptable(input.businessName),
    hasPrincipal: addressFilled(readJson(input.principalAddress)),
    hasMailing: mailing === 'SAME_AS_PRINCIPAL' || addressFilled(mailing),
    hasAgent,
    hasMember: (input.memberNames ?? []).some((name) => (name ?? '').trim().length > 0),
    hasSignature: (input.incorporatorSignature ?? '').trim().length > 0,
  };
}
