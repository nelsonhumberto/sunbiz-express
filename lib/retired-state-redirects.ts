/**
 * Public Delaware and Wyoming marketing URLs.
 * LaunchForma sells Florida formations. These paths 308 to the closest
 * Florida page. Order-flow query params (`?state=DE`) are not paths and
 * are left alone.
 *
 * The redirect table lives in `retired-state-redirects.cjs` so next.config.js
 * can load it. This module is the runtime matcher (middleware, sitemap).
 */

import { RETIRED_STATE_REDIRECTS as REDIRECT_RULES } from './retired-state-redirects.cjs';

export interface RetiredStateRedirect {
  source: string;
  destination: string;
  statusCode: 308;
}

const FLORIDA_STATE = '/states/florida';
const FLORIDA_LLC_GUIDE = '/guides/how-to-form-an-llc-in-florida';

export const RETIRED_STATE_REDIRECTS = REDIRECT_RULES as readonly RetiredStateRedirect[];

export function isRetiredStateSlug(slug: string): boolean {
  const value = slug.trim().toLowerCase();
  return value.includes('delaware') || value.includes('wyoming');
}

function pathOnly(pathname: string): string {
  const noHash = (pathname.split('#')[0] ?? pathname).split('?')[0] ?? '/';
  const withSlash = noHash.startsWith('/') ? noHash : `/${noHash}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) return withSlash.slice(0, -1);
  return withSlash || '/';
}

/**
 * Destination for a retired Delaware/Wyoming URL, or null when the path
 * should render. Matching is case-insensitive. The Spanish prefix is kept.
 */
export function retiredStateDestination(pathname: string): string | null {
  const path = pathOnly(pathname);
  const lower = path.toLowerCase();
  const spanish = lower === '/es' || lower.startsWith('/es/');
  const english = spanish ? (lower === '/es' ? '/' : lower.slice(3)) : lower;
  const prefix = spanish ? '/es' : '';

  const retiredState =
    english === '/delaware' ||
    english.startsWith('/delaware/') ||
    english === '/wyoming' ||
    english.startsWith('/wyoming/') ||
    english === '/states/delaware' ||
    english.startsWith('/states/delaware/') ||
    english === '/states/wyoming' ||
    english.startsWith('/states/wyoming/');
  if (retiredState) return `${prefix}${FLORIDA_STATE}`;

  const guide = english.match(/^\/guides\/([^/]+)/);
  if (guide && isRetiredStateSlug(guide[1] ?? '')) {
    return `${prefix}${FLORIDA_LLC_GUIDE}`;
  }
  return null;
}
