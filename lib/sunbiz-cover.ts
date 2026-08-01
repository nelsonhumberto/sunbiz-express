/**
 * Sunbiz Electronic Filing Cover Sheet helpers.
 *
 * Admins upload the cover as HTML (preferred), MHTML, or PDF. For HTML/MHTML
 * we clean the saved page, strip credentials, and fill the annual-report
 * email blank based on whether LaunchForma is the registered agent.
 */

import { safeParseJson } from '@/lib/utils';

export const NOTICE_EMAIL = 'notice@launchforma.com';

const EMAIL_BLANK_RE =
  /Email Address:\s*_{3,}/i;
const EMAIL_FILLED_RE =
  /Email Address:\s*([^\s_<][^\s<]*)/i;

export type CoverKind = 'html' | 'pdf' | 'unknown';

export function detectCoverKind(filename: string, mimeType?: string): CoverKind {
  const name = (filename || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    name.endsWith('.mhtml') ||
    name.endsWith('.mht') ||
    mime.includes('html') ||
    mime.includes('multipart/related')
  ) {
    return 'html';
  }
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  return 'unknown';
}

/**
 * Which email to put on the Sunbiz cover for annual-report mailings:
 * - LaunchForma RA → customer's correspondence / account email
 * - External RA → notice@launchforma.com (so we still receive state notices)
 */
export function resolveSunbizCoverEmail(args: {
  useOurRegisteredAgent: boolean;
  customerEmail?: string | null;
}): string {
  if (args.useOurRegisteredAgent) {
    const email = (args.customerEmail || '').trim();
    if (email && email.includes('@')) return email;
  }
  return NOTICE_EMAIL;
}

export function filingUsesOurRa(registeredAgentJson: string | null): boolean {
  const ra = safeParseJson<{ useOurService?: boolean } | null>(
    registeredAgentJson,
    null,
  );
  return ra?.useOurService === true;
}

/** Decode quoted-printable soft line breaks used in .mhtml. */
function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

/**
 * Pull the HTML document out of a Chrome/Safari .mhtml archive.
 * Falls back to the raw string when it already looks like HTML.
 */
export function extractHtmlFromUpload(raw: string, filename: string): string {
  const lower = filename.toLowerCase();
  const looksMhtml =
    lower.endsWith('.mhtml') ||
    lower.endsWith('.mht') ||
    raw.includes('Content-Type: multipart/related') ||
    raw.includes('Content-Location:');

  if (!looksMhtml) return raw;

  // Prefer the part that contains the cover sheet markers.
  const parts = raw.split(/------MultipartBoundary|--[0-9a-fA-F]{8,}|\r?\n--[^\n]+--?\r?\n/);
  let best = '';
  for (const part of parts) {
    const isHtml =
      /Content-Type:\s*text\/html/i.test(part) ||
      part.includes('<html') ||
      part.includes('<HTML');
    if (!isHtml) continue;
    const headerEnd = part.search(/\r?\n\r?\n/);
    let body = headerEnd >= 0 ? part.slice(headerEnd).trim() : part;
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(part)) {
      body = decodeQuotedPrintable(body);
    }
    if (
      /Email Address:/i.test(body) ||
      /Electronic Filing Cover Sheet/i.test(body) ||
      /\(\(\(H\d+/i.test(body)
    ) {
      return body;
    }
    if (body.length > best.length) best = body;
  }
  return best || raw;
}

/** Remove browser-extension junk + Sunbiz account passwords from query strings. */
export function sanitizeSunbizCoverHtml(html: string): string {
  let out = html;

  // Strip scripts / extension widgets.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<div class="AZInsight[\s\S]*$/i, '');
  out = out.replace(/<div class="az-app"[\s\S]*$/i, '');

  // Never persist Sunbiz account passwords embedded in saved menu links.
  out = out.replace(/([?&])acct_password=[^&"'<\s]*/gi, '$1acct_password=REDACTED');

  // Drop enormous inlined FA/CSS dumps when we can keep the cover body.
  // Prefer a slim document built from the cover markers when present.
  const audit = out.match(/\(\(\([A-Z]\d+[^)]*\)\)\)/);
  const emailBlock = out.match(
    /<pre>[\s\S]*?Email Address:[\s\S]*?<\/pre>/i,
  );
  const fromBlock = out.match(/<pre>[\s\S]*?Account Name[\s\S]*?<\/pre>/i);
  const entityBlock = out.match(
    /<table align="center" width="80%">[\s\S]*?<\/table>/i,
  );
  const feesBlock = out.match(
    /<table align="center" border="4"[\s\S]*?<\/table>/i,
  );
  const titleMatch = out.match(/Electronic Filing Cover Sheet/i);

  if (audit && (emailBlock || fromBlock)) {
    const faxNote =
      out.match(/Type the fax audit number[\s\S]{0,200}?document\./i)?.[0] ??
      'Please print this page and use it as a cover sheet. Type the fax audit number (shown below) on the top and bottom of all pages of the document.';

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Florida Division of Corporations — Electronic Filing Cover Sheet</title>
  <style>
    @page { size: letter; margin: 0.6in; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; margin: 0.5in; }
    h1 { text-align: center; font-size: 14pt; margin: 0 0 4px; }
    h2 { text-align: center; font-size: 12pt; margin: 0 0 16px; font-weight: normal; }
    .audit { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 0.04em; margin: 16px 0; }
    .note { text-align: center; font-size: 10pt; margin: 8px auto; max-width: 90%; }
    hr { border: none; border-top: 3px solid #222; width: 80%; margin: 14px auto; }
    pre { font-family: 'Courier New', monospace; font-size: 10.5pt; white-space: pre-wrap; margin: 0 auto; width: 80%; }
    .entity { text-align: center; font-size: 13pt; font-weight: bold; margin: 8px 0; }
    table.fees { border-collapse: collapse; margin: 12px auto; width: 50%; border: 3px solid #222; }
    table.fees td { border: 1px solid #222; padding: 6px 10px; }
    .email-block { text-align: center; margin: 12px auto; width: 80%; font-size: 11pt; }
  </style>
</head>
<body>
  <h1>Florida Department of State</h1>
  <h2>Division of Corporations<br/>Electronic Filing Cover Sheet</h2>
  <p class="note">${faxNote}</p>
  <p class="audit">${audit[0]}</p>
  <p class="note"><b>Note:</b> DO NOT hit the REFRESH/RELOAD button on your browser from this page. Doing so will generate another cover sheet.</p>
  <hr/>
  ${fromBlock?.[0] ?? ''}
  ${
    emailBlock?.[0] ??
    `<div class="email-block"><b>**Enter the email address for this business entity to be used for future annual report mailings. Enter only one email address please.**</b><br/><b>Email Address:________________________________________________</b></div>`
  }
  <hr/>
  ${entityBlock?.[0] ?? ''}
  ${feesBlock?.[0] ?? ''}
  ${titleMatch ? '' : ''}
</body>
</html>`;
  }

  // Fallback: keep original but truncated of trailing extension chrome.
  const bodyMatch = out.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    return `<!doctype html><html><head><meta charset="utf-8"/><title>Sunbiz Cover Sheet</title></head><body>${bodyMatch[1]}</body></html>`;
  }
  return out;
}

/** Fill the Sunbiz "Email Address:____" blank (or replace an existing value). */
export function injectSunbizCoverEmail(html: string, email: string): string {
  const safe = email.trim();
  if (!safe) return html;

  if (EMAIL_BLANK_RE.test(html)) {
    return html.replace(EMAIL_BLANK_RE, `Email Address: ${safe}`);
  }
  if (EMAIL_FILLED_RE.test(html)) {
    return html.replace(EMAIL_FILLED_RE, `Email Address: ${safe}`);
  }
  // Last resort: append before closing body.
  if (/<\/body>/i.test(html)) {
    return html.replace(
      /<\/body>/i,
      `<p><b>Email Address: ${safe}</b></p></body>`,
    );
  }
  return `${html}\n<p><b>Email Address: ${safe}</b></p>`;
}

export function processSunbizCoverUpload(args: {
  rawText: string;
  filename: string;
  email: string;
}): { html: string; mimeType: string } {
  const extracted = extractHtmlFromUpload(args.rawText, args.filename);
  const cleaned = sanitizeSunbizCoverHtml(extracted);
  const withEmail = injectSunbizCoverEmail(cleaned, args.email);
  return { html: withEmail, mimeType: 'text/html; charset=utf-8' };
}
