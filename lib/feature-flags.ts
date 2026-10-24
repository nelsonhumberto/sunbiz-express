/**
 * Env gates for the resume-order sequence and the checklist signup form.
 * Both default off. Any value other than the truthy set below is off,
 * including a missing variable.
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

/** Reply-To for the resume sequence. From is unchanged. */
export function resumeEmailReplyTo(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.EMAIL_REPLY_TO?.trim();
  return raw ? raw : 'admin@launchforma.com';
}
