import type { ResumeStepId } from './drip-copy';

/** Campaign value for the later resume steps. The 1 hour note uses abandoned-cart. */
export function resumeUtmCampaign(step: ResumeStepId): 'resume_1h' | 'resume_1d' | 'resume_3d' {
  switch (step) {
    case 'RESUME_1H':
      return 'resume_1h';
    case 'RESUME_1D':
      return 'resume_1d';
    case 'RESUME_3D':
      return 'resume_3d';
  }
}

/** Query params stamped on resume links. The 1 hour email is the abandoned-cart note. */
export function resumeUtmParams(step: ResumeStepId): {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
} {
  if (step === 'RESUME_1H') {
    return { utm_source: 'email', utm_medium: 'reminder', utm_campaign: 'abandoned-cart' };
  }
  return {
    utm_source: 'resume_email',
    utm_medium: 'email',
    utm_campaign: resumeUtmCampaign(step),
  };
}

/**
 * Add the resume-email campaign params. Existing query params stay.
 * Non-http(s) links, including mailto, are left alone.
 */
export function withResumeUtms(url: string, step: ResumeStepId): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
  const params = resumeUtmParams(step);
  parsed.searchParams.set('utm_source', params.utm_source);
  parsed.searchParams.set('utm_medium', params.utm_medium);
  parsed.searchParams.set('utm_campaign', params.utm_campaign);
  return parsed.toString();
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Stamp every http(s) href in a resume email, including the shared wrapper. */
export function decorateResumeEmailHtml(markup: string, step: ResumeStepId): string {
  return markup.replace(/href="([^"]*)"/gi, (_full, raw: string) => {
    return `href="${escapeAttr(withResumeUtms(decodeAttr(raw), step))}"`;
  });
}
