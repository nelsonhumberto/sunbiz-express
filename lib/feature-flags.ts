/**
 * Env gates for marketing email. All default off. Any value other than
 * the truthy set below is off, including a missing variable.
 */

function envEnabled(value: string | undefined): boolean {
  const raw = (value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isResumeDripEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envEnabled(env.RESUME_DRIP_ENABLED);
}

export function isSignupCaptureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envEnabled(env.SIGNUP_CAPTURE_ENABLED);
}

/** Post-approval day 3 / 14 / 30 sequence. Default off. */
export function isPostFormationSeriesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envEnabled(env.POST_FORMATION_SERIES_ENABLED);
}

/** Weekly notes for confirmed checklist subscribers. Default off. */
export function isWeeklyNewsletterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envEnabled(env.WEEKLY_NEWSLETTER_ENABLED);
}

/** Reply-To for the resume sequence. From is unchanged. */
export function resumeEmailReplyTo(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.EMAIL_REPLY_TO?.trim();
  return raw ? raw : 'admin@launchforma.com';
}
