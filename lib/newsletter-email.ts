import type { DripLocale } from '@/lib/drip-copy';
import {
  newsletterIssueCopy,
  type NewsletterIssueNumber,
  type NewsletterSection,
} from '@/lib/newsletter';

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

/** Plain text, plus [label](https://...) links from the approved copy. */
function inlineHtml(value: string): string {
  const pattern = /\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)/g;
  let html = '';
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(last, index));
    const label = match[1] ?? '';
    const href = match[2] ?? '';
    html += `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    last = index + match[0].length;
  }
  html += escapeHtml(value.slice(last));
  return html;
}

function sectionHtml(section: NewsletterSection): string {
  const paragraphs = section.paragraphs.map((paragraph) => `<p>${inlineHtml(paragraph)}</p>`).join('');
  const lead = section.bulletLead ? `<p>${inlineHtml(section.bulletLead)}</p>` : '';
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`
    : '';
  const after = section.after ? `<p>${inlineHtml(section.after)}</p>` : '';
  const closing = section.closing?.map((paragraph) => `<p>${inlineHtml(paragraph)}</p>`).join('') ?? '';
  const title = section.title ? `<h2>${escapeHtml(section.title)}</h2>` : '';
  return `${title}${paragraphs}${lead}${bullets}${after}${closing}`;
}

export function newsletterCtaUrl(path: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  if (path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildNewsletterEmail(args: {
  issue: NewsletterIssueNumber;
  locale: DripLocale;
  siteUrl: string;
  unsubscribeUrl: string;
}): { subject: string; inner: string } {
  const copy = newsletterIssueCopy(args.issue, args.locale);
  const ctaUrl = newsletterCtaUrl(copy.ctaPath, args.siteUrl);
  const inner = `${preheader(copy.preview)}
<p>${escapeHtml(copy.greeting)}</p>
<p>${escapeHtml(copy.intro)}</p>
${copy.sections.map((section) => sectionHtml(section)).join('')}
<h2>${escapeHtml(copy.closerTitle)}</h2>
<p>${escapeHtml(copy.closerBody)}</p>
<a class="cta" href="${escapeHtml(ctaUrl)}">${escapeHtml(copy.cta)}</a>
<p>${escapeHtml(copy.signoff)}<br/>${escapeHtml(copy.team)}</p>
<p class="muted"><em>${escapeHtml(copy.disclaimer)}</em></p>
<p class="muted">${escapeHtml(copy.reason)} <a href="${escapeHtml(args.unsubscribeUrl)}">${escapeHtml(copy.unsubscribe)}</a><br/>${escapeHtml(copy.address)}</p>`;
  return { subject: copy.subject, inner };
}
