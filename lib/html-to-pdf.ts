/**
 * Convert LaunchForma HTML "documents" (Articles, receipts, OA, etc.) into
 * a downloadable PDF. Uses cheerio to walk the semantic markup already
 * produced by lib/pdf.ts and pdf-lib to lay out Letter pages.
 *
 * Intentionally avoids Chromium so it stays small enough for Vercel serverless.
 */

import { load, type CheerioAPI } from 'cheerio';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

/** Cheerio DOM node (tag). Kept loose — cheerio's public types vary by version. */
type DomNode = {
  type?: string;
  name?: string;
  tagName?: string;
};

const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string; italic?: boolean; bold?: boolean; center?: boolean; small?: boolean }
  | { kind: 'spacer'; height: number }
  | { kind: 'hr' }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'badge'; title: string; body: string; tone: 'success' | 'warn' };

function normalizeText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function collectBlocks($: CheerioAPI): Block[] {
  const blocks: Block[] = [];
  const body = $('body');

  body.children().each((_, el) => {
    walk($, el, blocks);
  });

  return blocks;
}

function walk($: CheerioAPI, el: DomNode, blocks: Block[]) {
  if (el.type && el.type !== 'tag') return;
  const tag = (el.name || el.tagName || '').toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $el = $(el as any);
  const cls = ($el.attr('class') || '').toLowerCase();

  if (tag === 'style' || tag === 'script') return;

  if (cls.includes('filing-stamp') || cls.includes('pending-badge')) {
    const title = normalizeText($el.find('h4, strong').first().text()) || 'STATUS';
    const body = normalizeText(
      $el
        .clone()
        .children('h4, strong')
        .remove()
        .end()
        .text(),
    );
    blocks.push({
      kind: 'badge',
      title,
      body,
      tone: cls.includes('pending') ? 'warn' : 'success',
    });
    return;
  }

  if (tag === 'h1') {
    const t = normalizeText($el.text());
    if (t) blocks.push({ kind: 'h1', text: t });
    return;
  }
  if (tag === 'h2') {
    const t = normalizeText($el.text());
    if (t) blocks.push({ kind: 'h2', text: t });
    return;
  }
  if (tag === 'h3') {
    const t = normalizeText($el.text());
    if (t) blocks.push({ kind: 'h3', text: t });
    return;
  }
  if (tag === 'p') {
    const t = normalizeText($el.text());
    if (!t) return;
    blocks.push({
      kind: 'p',
      text: t,
      italic: cls.includes('legend') || cls.includes('footer-note') || !!$el.find('em').length,
      bold: !!$el.find('strong').length && $el.find('strong').text().trim() === t,
      center: ($el.attr('style') || '').includes('text-align:center'),
      small: cls.includes('legend') || cls.includes('footer-note'),
    });
    return;
  }
  if (tag === 'table') {
    const rows: string[][] = [];
    $el.find('tr').each((__, tr) => {
      const cells: string[] = [];
      $(tr)
        .children('td, th')
        .each((___, cell) => {
          cells.push(normalizeText($(cell).text()));
        });
      if (cells.some((c) => c)) rows.push(cells);
    });
    if (rows.length) blocks.push({ kind: 'table', rows });
    return;
  }
  if (tag === 'hr') {
    blocks.push({ kind: 'hr' });
    return;
  }
  if (tag === 'div' || tag === 'section') {
    if (cls.includes('signature-block') || cls.includes('signature-line') || cls.includes('article')) {
      // Flatten signature / article sections as paragraphs.
      const t = normalizeText($el.text());
      if (t) {
        // Prefer walking children for structure when present.
        const kids = $el.children();
        if (kids.length) {
          kids.each((__, child) => walk($, child, blocks));
        } else {
          blocks.push({ kind: 'p', text: t });
        }
      }
      return;
    }
    $el.children().each((__, child) => walk($, child, blocks));
    return;
  }

  // Fallback: if element has meaningful direct text, keep it.
  const direct = normalizeText(
    $el
      .clone()
      .children()
      .remove()
      .end()
      .text(),
  );
  if (direct) blocks.push({ kind: 'p', text: direct });
  $el.children().each((__, child) => walk($, child, blocks));
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      // Hard-break very long tokens
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          const t = chunk + ch;
          if (font.widthOfTextAtSize(t, size) > maxWidth) {
            if (chunk) lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export async function htmlDocumentToPdf(html: string, title = 'Document'): Promise<Uint8Array> {
  const $ = load(html);
  // Prefer body content; fall back to whole doc.
  if (!$('body').length) {
    $('html').wrapInner('<body></body>');
  }
  const blocks = collectBlocks($);
  if (blocks.length === 0) {
    const fallback = normalizeText($.text());
    if (fallback) blocks.push({ kind: 'p', text: fallback });
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('LaunchForma');
  pdf.setCreator('LaunchForma');

  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawWrapped = (
    text: string,
    opts: {
      size: number;
      font: PDFFont;
      color?: { r: number; g: number; b: number };
      center?: boolean;
      lineGap?: number;
      maxWidth?: number;
    },
  ) => {
    const size = opts.size;
    const lineGap = opts.lineGap ?? size * 1.35;
    const maxWidth = opts.maxWidth ?? CONTENT_WIDTH;
    const color = opts.color ?? { r: 0.06, g: 0.12, b: 0.11 };
    const lines = wrapLines(text, opts.font, size, maxWidth);
    for (const line of lines) {
      ensureSpace(lineGap);
      const width = opts.font.widthOfTextAtSize(line, size);
      const x = opts.center ? MARGIN + (CONTENT_WIDTH - width) / 2 : MARGIN;
      page.drawText(line, {
        x,
        y: y - size,
        size,
        font: opts.font,
        color: rgb(color.r, color.g, color.b),
      });
      y -= lineGap;
    }
  };

  for (const block of blocks) {
    if (block.kind === 'spacer') {
      y -= block.height;
      continue;
    }
    if (block.kind === 'hr') {
      ensureSpace(16);
      page.drawLine({
        start: { x: MARGIN, y: y - 4 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 4 },
        thickness: 0.75,
        color: rgb(0.28, 0.35, 0.34),
      });
      y -= 16;
      continue;
    }
    if (block.kind === 'h1') {
      y -= 8;
      drawWrapped(block.text.toUpperCase(), {
        size: 16,
        font: fontBold,
        center: true,
        lineGap: 20,
      });
      y -= 4;
      continue;
    }
    if (block.kind === 'h2') {
      drawWrapped(block.text, {
        size: 12,
        font: fontItalic,
        center: true,
        lineGap: 16,
        color: { r: 0.2, g: 0.25, b: 0.24 },
      });
      y -= 10;
      continue;
    }
    if (block.kind === 'h3') {
      y -= 10;
      ensureSpace(22);
      drawWrapped(block.text, { size: 12, font: fontBold, lineGap: 16 });
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: PAGE_WIDTH - MARGIN, y: y + 2 },
        thickness: 0.6,
        color: rgb(0.06, 0.12, 0.11),
      });
      y -= 8;
      continue;
    }
    if (block.kind === 'p') {
      const f = block.bold ? fontBold : block.italic ? fontItalic : font;
      drawWrapped(block.text, {
        size: block.small ? 9 : 11,
        font: f,
        center: block.center,
        lineGap: block.small ? 12 : 15,
        color: block.small
          ? { r: 0.28, g: 0.35, b: 0.34 }
          : { r: 0.06, g: 0.12, b: 0.11 },
      });
      y -= 4;
      continue;
    }
    if (block.kind === 'badge') {
      ensureSpace(70);
      const boxH = 56;
      const fill =
        block.tone === 'warn'
          ? rgb(0.996, 0.953, 0.78)
          : rgb(0.93, 0.97, 0.95);
      const stroke =
        block.tone === 'warn' ? rgb(0.705, 0.325, 0.035) : rgb(0.043, 0.478, 0.42);
      page.drawRectangle({
        x: PAGE_WIDTH - MARGIN - 200,
        y: y - boxH,
        width: 200,
        height: boxH,
        borderColor: stroke,
        borderWidth: 1.5,
        color: fill,
      });
      page.drawText(block.title.toUpperCase(), {
        x: PAGE_WIDTH - MARGIN - 190,
        y: y - 18,
        size: 10,
        font: fontBold,
        color: stroke,
      });
      const bodyLines = wrapLines(block.body, font, 8, 180);
      let by = y - 32;
      for (const line of bodyLines.slice(0, 3)) {
        page.drawText(line, {
          x: PAGE_WIDTH - MARGIN - 190,
          y: by,
          size: 8,
          font,
          color: stroke,
        });
        by -= 10;
      }
      y -= boxH + 12;
      continue;
    }
    if (block.kind === 'table') {
      const colCount = Math.max(...block.rows.map((r) => r.length), 1);
      const colW = CONTENT_WIDTH / colCount;
      y -= 4;
      for (const row of block.rows) {
        // Measure row height from wrapped cells
        const cellLines = row.map((cell, i) =>
          wrapLines(cell || '—', font, 10, colW - 10),
        );
        const rowHeight = Math.max(...cellLines.map((l) => l.length), 1) * 13 + 8;
        ensureSpace(rowHeight + 2);
        // Header-ish first cell bold if short label
        for (let i = 0; i < colCount; i++) {
          const lines = cellLines[i] ?? ['—'];
          let cy = y - 12;
          for (const line of lines) {
            page.drawText(line, {
              x: MARGIN + i * colW + 4,
              y: cy,
              size: 10,
              font: i === 0 && row.length > 1 ? fontBold : font,
              color: rgb(0.06, 0.12, 0.11),
            });
            cy -= 13;
          }
        }
        y -= rowHeight;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.4,
          color: rgb(0.85, 0.89, 0.88),
        });
        y -= 2;
      }
      y -= 8;
    }
  }

  // If somehow empty
  if (pdf.getPageCount() === 0) {
    const p = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    p.drawText(title, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 20, size: 14, font: fontBold });
  }

  return pdf.save();
}

/** Safe ASCII filename for Content-Disposition. */
export function pdfFilename(title: string): string {
  const base = (title || 'document')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return `${base || 'document'}.pdf`;
}
