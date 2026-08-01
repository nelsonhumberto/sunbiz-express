/**
 * Sunbiz Electronic Filing Cover Sheet helpers.
 *
 * Prefer preserving the original cover (barcode + layout). HTML/MHTML get a
 * light cleanup + barcode inlined as a data URI; PDFs keep their vector
 * layout, get the email stamped in, and trailing blank pages removed.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { safeParseJson } from '@/lib/utils';

export const NOTICE_EMAIL = 'notice@launchforma.com';

const EMAIL_BLANK_RE = /Email Address:\s*_{3,}/i;
const EMAIL_FILLED_RE = /Email Address:\s*([^\s_<][^\s<]*)/i;

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
 * Annual-report email on the Sunbiz cover:
 * - LaunchForma is RA → notice@launchforma.com (our inbox)
 * - External RA → customer's email (fallback notice@)
 */
export function resolveSunbizCoverEmail(args: {
  useOurRegisteredAgent: boolean;
  customerEmail?: string | null;
}): string {
  if (args.useOurRegisteredAgent) return NOTICE_EMAIL;
  const email = (args.customerEmail || '').trim();
  if (email && email.includes('@')) return email;
  return NOTICE_EMAIL;
}

export function filingUsesOurRa(registeredAgentJson: string | null): boolean {
  const ra = safeParseJson<{ useOurService?: boolean } | null>(
    registeredAgentJson,
    null,
  );
  return ra?.useOurService === true;
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

type MhtmlPart = {
  headers: string;
  body: string;
  contentType: string;
  contentLocation: string;
  transferEncoding: string;
};

function splitMhtmlParts(raw: string): MhtmlPart[] {
  // Chrome: ------MultipartBoundary--xxxx
  const boundaryMatch = raw.match(/------MultipartBoundary[\w-]+/);
  const boundary = boundaryMatch?.[0];
  const chunks = boundary
    ? raw.split(new RegExp(`${boundary.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:--)?`))
    : raw.split(/\r?\n--[^\n]+(?:--)?\r?\n/);

  const parts: MhtmlPart[] = [];
  for (const chunk of chunks) {
    const headerEnd = chunk.search(/\r?\n\r?\n/);
    if (headerEnd < 0) continue;
    const headers = chunk.slice(0, headerEnd);
    let body = chunk.slice(headerEnd).replace(/^\r?\n\r?\n/, '');
    const contentType = /Content-Type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim() || '';
    const contentLocation =
      /Content-Location:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || '';
    const transferEncoding =
      /Content-Transfer-Encoding:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || '';
    if (/quoted-printable/i.test(transferEncoding)) body = decodeQuotedPrintable(body);
    parts.push({ headers, body, contentType, contentLocation, transferEncoding });
  }
  return parts;
}

function partBytes(part: MhtmlPart): Buffer | null {
  const enc = part.transferEncoding.toLowerCase();
  const body = part.body.trim();
  if (!body) return null;
  if (enc.includes('base64') || /^\/9j\//.test(body.replace(/\s+/g, '').slice(0, 10))) {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64');
    } catch {
      return null;
    }
  }
  if (enc.includes('quoted-printable') || enc === '' || enc.includes('7bit') || enc.includes('8bit')) {
    // Already decoded QP above when flagged; treat as latin1 binary otherwise.
    return Buffer.from(body, 'binary');
  }
  return null;
}

/** Extract HTML document + optional barcode JPEG from an .mhtml archive. */
export function extractFromMhtml(raw: string): { html: string; barcodeJpeg?: Buffer } {
  const parts = splitMhtmlParts(raw);
  let html = '';
  let barcodeJpeg: Buffer | undefined;

  for (const part of parts) {
    const loc = part.contentLocation;
    const type = part.contentType.toLowerCase();
    if (type.includes('text/html') || part.body.includes('<html') || part.body.includes('<HTML')) {
      const candidate = part.body.trim();
      if (
        /Email Address:/i.test(candidate) ||
        /Electronic Filing Cover Sheet/i.test(candidate) ||
        /\(\(\(H\d+/i.test(candidate)
      ) {
        html = candidate;
      } else if (!html && candidate.length > 200) {
        html = candidate;
      }
    }
    if (
      /idalin\.asp/i.test(loc) ||
      (/image\/jpeg/i.test(type) && /barcode|idalin/i.test(loc))
    ) {
      const bytes = partBytes(part);
      if (bytes && bytes.length > 100 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        barcodeJpeg = bytes;
      }
    }
  }

  // Fallback: JPEG marker anywhere after idalin Content-Location
  if (!barcodeJpeg) {
    const idx = raw.search(/idalin\.asp[^\n]*\r?\n/i);
    if (idx >= 0) {
      const after = raw.slice(idx);
      const b64Match = after.match(/(\/9j\/[A-Za-z0-9+/=\s]{200,})/);
      if (b64Match) {
        try {
          const buf = Buffer.from(b64Match[1].replace(/\s+/g, ''), 'base64');
          if (buf[0] === 0xff && buf[1] === 0xd8) barcodeJpeg = buf;
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { html: html || raw, barcodeJpeg };
}

export function extractHtmlFromUpload(raw: string, filename: string): {
  html: string;
  barcodeJpeg?: Buffer;
} {
  const lower = filename.toLowerCase();
  const looksMhtml =
    lower.endsWith('.mhtml') ||
    lower.endsWith('.mht') ||
    raw.includes('Content-Type: multipart/related') ||
    raw.includes('Content-Location:');

  if (looksMhtml) return extractFromMhtml(raw);
  return { html: raw };
}

/** Light cleanup — keep layout/CSS/images; strip secrets + extension widgets. */
export function sanitizeSunbizCoverHtml(html: string): string {
  let out = html;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<div class="AZInsight[\s\S]*?(?=<|$)/gi, '');
  out = out.replace(/([?&])acct_password=[^&"'<\s]*/gi, '$1acct_password=REDACTED');
  return out;
}

/** Inline barcode `<img>` so the saved HTML still shows the fax barcode. */
export function embedBarcodeInHtml(html: string, barcodeJpeg?: Buffer): string {
  if (!barcodeJpeg || barcodeJpeg.length < 100) return html;
  const dataUri = `data:image/jpeg;base64,${barcodeJpeg.toString('base64')}`;
  // Common patterns from Chrome "Save As" / MHTML
  return html
    .replace(
      /(<img[^>]+src=["'])[^"']*idalin\.asp[^"']*(["'][^>]*>)/gi,
      `$1${dataUri}$2`,
    )
    .replace(
      /(<img[^>]+src=["'])\.\/Division of Corporations_files\/idalin\.asp(["'][^>]*>)/gi,
      `$1${dataUri}$2`,
    )
    .replace(
      /(<img[^>]+src=["'])https?:\/\/efile\.sunbiz\.org\/Scripts\/idalin\.asp[^"']*(["'][^>]*>)/gi,
      `$1${dataUri}$2`,
    );
}

export function injectSunbizCoverEmail(html: string, email: string): string {
  const safe = email.trim();
  if (!safe) return html;
  if (EMAIL_BLANK_RE.test(html)) {
    return html.replace(EMAIL_BLANK_RE, `Email Address: ${safe}`);
  }
  if (EMAIL_FILLED_RE.test(html)) {
    return html.replace(EMAIL_FILLED_RE, `Email Address: ${safe}`);
  }
  return html;
}

export function processSunbizCoverUpload(args: {
  rawText: string;
  filename: string;
  email: string;
  /** Optional sidecar barcode JPEG (from HTML "Save As" _files folder). */
  barcodeJpeg?: Buffer;
}): { html: string; mimeType: string; barcodeJpeg?: Buffer } {
  const extracted = extractHtmlFromUpload(args.rawText, args.filename);
  const barcode = args.barcodeJpeg || extracted.barcodeJpeg;
  let html = sanitizeSunbizCoverHtml(extracted.html);
  html = embedBarcodeInHtml(html, barcode);
  html = injectSunbizCoverEmail(html, args.email);
  return { html, mimeType: 'text/html; charset=utf-8', barcodeJpeg: barcode };
}

function pageContentLength(page: { node: { Contents: () => unknown } }): number {
  try {
    const contents = page.node.Contents();
    if (!contents) return 0;
    // pdf-lib: Contents may be a stream ref or array
    const asAny = contents as { size?: () => number; toString?: () => string };
    if (typeof asAny.size === 'function') return asAny.size();
    return String(contents).length;
  } catch {
    return 0;
  }
}

/** Drop trailing / empty pages (Sunbiz print-to-PDF often adds a blank page 2). */
export async function stripBlankPdfPages(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes);
  const count = src.getPageCount();
  if (count <= 1) return pdfBytes;

  const keep: number[] = [];
  for (let i = 0; i < count; i++) {
    const page = src.getPage(i);
    const len = pageContentLength(page);
    // Real cover content streams are tens of KB; blank pages are tiny.
    if (len > 200 || i === 0) keep.push(i);
  }
  // Always keep at least page 0; drop obvious blanks after it.
  const filtered = keep.length ? keep : [0];
  // Prefer: keep first page only when later pages look blank
  const finalIdx =
    filtered.length > 1
      ? filtered.filter((i, n) => n === 0 || pageContentLength(src.getPage(i)) > 800)
      : filtered;
  const indices = finalIdx.length ? finalIdx : [0];

  if (indices.length === count) return pdfBytes;

  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  for (const p of pages) out.addPage(p);
  return out.save();
}

/**
 * Stamp the annual-report email onto the Sunbiz cover PDF over the
 * "Email Address:____" blank, then remove blank trailing pages.
 *
 * Coordinates calibrated from Sunbiz Letter covers (poppler bbox):
 * Email Address line ≈ yMin 447 from top on 792-tall page → PDF y ≈ 334.
 */
export async function processSunbizCoverPdf(
  pdfBytes: Uint8Array,
  email: string,
): Promise<Uint8Array> {
  const stripped = await stripBlankPdfPages(pdfBytes);
  const pdf = await PDFDocument.load(stripped);
  const page = pdf.getPage(0);
  const { height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const safe = email.trim().slice(0, 80);
  const fontSize = 11;

  // Cover the underscore run, then draw the email.
  // Bbox: Address:____ starts ~x=159, text bottom ~458 from top.
  const y = height - 458.3; // ≈ 333.7 on Letter
  const textX = 210;
  const textWidth = font.widthOfTextAtSize(safe, fontSize);

  page.drawRectangle({
    x: 205,
    y: y - 2,
    width: Math.max(280, textWidth + 12),
    height: 14,
    color: rgb(1, 1, 1),
  });
  page.drawText(safe, {
    x: textX,
    y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  return pdf.save();
}

/**
 * Build a 1-page Letter PDF from cleaned Sunbiz cover HTML + barcode image.
 * Used when FILE-merging an HTML/MHTML upload (cheerio text PDF would drop the barcode).
 */
export async function sunbizCoverHtmlToPdf(
  html: string,
  opts?: { barcodeJpeg?: Buffer; email?: string },
): Promise<Uint8Array> {
  const email =
    opts?.email ||
    /Email Address:\s*([^\s_<][^\s<]*)/i.exec(html)?.[1] ||
    NOTICE_EMAIL;

  const audit =
    html.match(/\(\(\([A-Z0-9][^)]*\)\)\)/)?.[0] ||
    html.match(/BARCODE=([A-Z0-9]+)/i)?.[1] ||
    '';

  const accountName =
    html.match(/Account Name\s*:?\s*([^\n<]+)/i)?.[1]?.trim() || 'LAUNCHFORMA';
  const accountNumber =
    html.match(/Account Number\s*:?\s*([^\n<]+)/i)?.[1]?.trim() || '';
  const phone = html.match(/Phone\s*:?\s*([^\n<]+)/i)?.[1]?.trim() || '';
  const faxFrom = html.match(/Fax Number\s*:?\s*(\([0-9]{3}\)[0-9-]+)/gi);
  const toFax = faxFrom?.[0]?.replace(/Fax Number\s*:?\s*/i, '') || '(850)617-6381';
  const fromFax =
    faxFrom?.[1]?.replace(/Fax Number\s*:?\s*/i, '') ||
    html.match(/Fax Number\s*:?\s*(\([0-9]{3}\)[0-9-]+)/i)?.[1] ||
    '';

  const entityType =
    html.match(/FLORIDA LIMITED LIABILITY CO\.?/i)?.[0] ||
    html.match(/FLORIDA PROFIT CORPORATION/i)?.[0] ||
    'FLORIDA LIMITED LIABILITY CO.';
  // Business name sits in the next +1 bold font cell after the entity-type line.
  const nameMatch = html.match(
    /FLORIDA (?:LIMITED LIABILITY CO\.?|PROFIT CORPORATION)[\s\S]{0,400}?<font size="\+1"><b>([^<]{2,100})<\/b><\/font>/i,
  );
  const businessName = (nameMatch?.[1] || '').trim();

  const certStatus = html.match(/Certificate of Status<\/td><td[^>]*><b>(\d+)<\/b>/i)?.[1] || '0';
  const certCopy = html.match(/Certified Copy<\/td><td[^>]*><b>(\d+)<\/b>/i)?.[1] || '0';
  const pageCount = html.match(/Page Count<\/td><td[^>]*><b>(\d+)<\/b>/i)?.[1] || '';
  const charge = html.match(/Estimated Charge<\/td><td[^>]*><b>\s*([^<]+)<\/b>/i)?.[1]?.trim() || '';

  // Prefer data-URI barcode already in HTML
  let barcode = opts?.barcodeJpeg;
  if (!barcode) {
    const dataUri = html.match(
      /src=["'](data:image\/jpeg;base64,[A-Za-z0-9+/=]+)["']/i,
    )?.[1];
    if (dataUri) {
      barcode = Buffer.from(dataUri.split(',')[1] || '', 'base64');
    }
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  let y = 740;
  const center = (text: string, size: number, f = fontBold) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (612 - w) / 2, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 4;
  };

  center('Florida Department of State', 14);
  center('Division of Corporations', 12);
  center('Electronic Filing Cover Sheet', 12, font);
  y -= 8;
  page.drawText(
    'Note: Please print this page and use it as a cover sheet. Type the fax audit number',
    { x: 72, y, size: 9, font, color: rgb(0, 0, 0) },
  );
  y -= 12;
  page.drawText('(shown below) on the top and bottom of all pages of the document.', {
    x: 110,
    y,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 28;

  if (audit) center(audit, 14, fontBold);

  if (barcode && barcode.length > 100) {
    try {
      const img = await pdf.embedJpg(barcode);
      const maxW = 360;
      const scale = Math.min(maxW / img.width, 48 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (612 - w) / 2, y: y - h, width: w, height: h });
      y -= h + 16;
    } catch {
      /* ignore bad jpeg */
    }
  } else {
    y -= 8;
  }

  page.drawText(
    'Note: DO NOT hit the REFRESH/RELOAD button on your browser from this page.',
    { x: 90, y, size: 9, font, color: rgb(0, 0, 0) },
  );
  y -= 12;
  page.drawText('Doing so will generate another cover sheet.', {
    x: 180,
    y,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 18;

  page.drawLine({
    start: { x: 72, y },
    end: { x: 540, y },
    thickness: 2,
    color: rgb(0, 0, 0),
  });
  y -= 20;

  const drawMono = (line: string) => {
    page.drawText(line, { x: 100, y, size: 10, font: mono, color: rgb(0, 0, 0) });
    y -= 13;
  };
  drawMono('To:');
  drawMono('      Division of Corporations');
  drawMono(`      Fax Number     : ${toFax}`);
  y -= 6;
  drawMono('From:');
  drawMono(`      Account Name   : ${accountName}`);
  if (accountNumber) drawMono(`      Account Number : ${accountNumber}`);
  if (phone) drawMono(`      Phone          : ${phone}`);
  if (fromFax) drawMono(`      Fax Number     : ${fromFax}`);
  y -= 16;

  page.drawText(
    '**Enter the email address for this business entity to be used for future',
    { x: 90, y, size: 10, font: fontBold, color: rgb(0, 0, 0) },
  );
  y -= 13;
  page.drawText('annual report mailings. Enter only one email address please.**', {
    x: 110,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 18;
  page.drawText(`Email Address: ${email}`, {
    x: 160,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 16;

  page.drawLine({
    start: { x: 72, y },
    end: { x: 540, y },
    thickness: 2,
    color: rgb(0, 0, 0),
  });
  y -= 22;

  center(entityType, 12, fontBold);
  if (businessName) center(businessName, 12, fontBold);
  y -= 8;

  // Fees box
  const boxX = 156;
  const boxW = 300;
  const rows: [string, string][] = [
    ['Certificate of Status', certStatus],
    ['Certified Copy', certCopy],
  ];
  if (pageCount) rows.push(['Page Count', pageCount]);
  if (charge) rows.push(['Estimated Charge', charge]);
  const rowH = 18;
  const boxH = rows.length * rowH + 4;
  page.drawRectangle({
    x: boxX,
    y: y - boxH,
    width: boxW,
    height: boxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
  });
  let ry = y - 14;
  for (const [label, val] of rows) {
    page.drawText(label, { x: boxX + 10, y: ry, size: 10, font, color: rgb(0, 0, 0) });
    const vw = fontBold.widthOfTextAtSize(val, 10);
    page.drawText(val, {
      x: boxX + boxW - 12 - vw,
      y: ry,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    ry -= rowH;
  }

  return pdf.save();
}
