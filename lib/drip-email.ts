import {
  checklistCopy,
  checklistPageUrl,
  type DripLocale,
  resumeFrameCopy,
  resumeStepCopy,
  type ResumeStepId,
} from '@/lib/drip-copy';
import { resolveDripLocale } from '@/lib/draft-recovery';
import { withResumeUtms } from '@/lib/resume-utm';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function preheader(text: string): string {
  return `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(text)}</div>`;
}

function footerBlock(args: {
  reason: string;
  unsubscribeLabel: string;
  unsubscribeUrl?: string;
  address: string;
}): string {
  const link = args.unsubscribeUrl
    ? `<a href="${escapeHtml(args.unsubscribeUrl)}">${escapeHtml(args.unsubscribeLabel)}</a>`
    : escapeHtml(args.unsubscribeLabel);
  return `<p class="muted">${escapeHtml(args.reason)}<br/>${link}<br/>${escapeHtml(args.address)}</p>`;
}

export function buildResumeEmail(args: {
  step: ResumeStepId;
  locale?: string | null;
  firstName?: string | null;
  resumeUrl: string;
  unsubscribeUrl?: string;
}): { subject: string; inner: string } {
  const locale: DripLocale = resolveDripLocale(args.locale);
  const copy = resumeStepCopy(args.step, locale);
  const frame = resumeFrameCopy(locale);
  const resumeUrl = withResumeUtms(args.resumeUrl, args.step);
  const unsubscribeUrl = args.unsubscribeUrl
    ? withResumeUtms(args.unsubscribeUrl, args.step)
    : undefined;
  const paragraphs = copy.paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const inner = `${preheader(copy.preview)}
<p>${escapeHtml(frame.greeting(args.firstName))}</p>
${paragraphs}
<a class="cta" href="${escapeHtml(resumeUrl)}">${escapeHtml(copy.cta)}</a>
<p>${escapeHtml(frame.thanks)}<br/>${escapeHtml(frame.team)}</p>
${footerBlock({
  reason: frame.reason,
  unsubscribeLabel: frame.unsubscribe,
  unsubscribeUrl,
  address: frame.address,
})}`;
  return { subject: copy.subject, inner };
}

export function buildChecklistEmail(args: {
  locale?: string | null;
  firstName?: string | null;
  siteUrl: string;
  unsubscribeUrl?: string;
}): { subject: string; inner: string } {
  const locale: DripLocale = resolveDripLocale(args.locale);
  const copy = checklistCopy(locale);
  const downloadUrl = checklistPageUrl(locale, args.siteUrl);
  const inner = `${preheader(copy.preview)}
<p>${escapeHtml(copy.greeting(args.firstName))}</p>
<p>${escapeHtml(copy.intro)}</p>
<a class="cta" href="${escapeHtml(downloadUrl)}">${escapeHtml(copy.cta)}</a>
<p>${escapeHtml(copy.detail)}</p>
<p>${escapeHtml(copy.closing)}</p>
<p>${escapeHtml(copy.thanks)}<br/>${escapeHtml(copy.team)}</p>
${footerBlock({
  reason: copy.disclaimer,
  unsubscribeLabel: copy.unsubscribe,
  unsubscribeUrl: args.unsubscribeUrl,
  address: copy.address,
})}`;
  return { subject: copy.subject, inner };
}
