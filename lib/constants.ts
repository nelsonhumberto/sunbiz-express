/** Cookie name used to persist the visitor's chosen formation state. */
export const PREFERRED_STATE_COOKIE = 'preferred_state';

export const COPYRIGHT_YEAR = new Date().getFullYear();

/**
 * Legal entity name. Use this wherever the contracting party is named
 * (footer, legal pages, email footers). Marketing copy keeps the
 * "LaunchForma" brand.
 */
export const BUSINESS_LEGAL_NAME = 'LAUNCHFORMA, LLC';
export const BUSINESS_ADDRESS = '14160 Palmetto Frontage Road, Suite 101, Miami Lakes, FL 33016';

/** Public inbox already used on the about page. */
export const BUSINESS_EMAIL = 'hello@launchforma.com';

/**
 * Customer-service phone. Leave `NEXT_PUBLIC_BUSINESS_PHONE` unset until a
 * real number is confirmed. Callers must render nothing when this is empty —
 * do not substitute a placeholder number.
 */
export const BUSINESS_PHONE = (process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? '').trim();
