/**
 * Convert LaunchForma HTML "documents" (Articles, receipts, OA, etc.) into
 * a downloadable PDF. Uses cheerio to walk the semantic markup already
 * produced by lib/pdf.ts and pdf-lib to lay out Letter pages.
 *
 * Article sections (`section.article`) and signature blocks are measured and
 * kept together when they fit on a single page - preventing mid-article cuts.
 */

import { load, type CheerioAPI } from 'cheerio';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/** Cheerio DOM node (tag). Kept loose - cheerio's public types vary by version. */
type DomNode = {
  type?: string;
  name?: string;
  tagName?: string;
};

const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN;

type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string; italic?: boolean; bold?: boolean; center?: boolean; small?: boolean }
  | { kind: 'spacer'; height: number }
  | { kind: 'hr' }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'badge'; title: string; body: string; tone: 'success' | 'warn' }
  | { kind: 'group'; blocks: Block[] };

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

  // Keep article sections and signature blocks together across page breaks.
  if (
    (tag === 'section' || tag === 'div') &&
    (cls.includes('article') || cls.includes('signature-block'))
  ) {
    const group: Block[] = [];
    $el.children().each((__, child) => walk($, child, group));
    if (group.length) blocks.push({ kind: 'group', blocks: group });
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
    const pCls = cls;
    blocks.push({
      kind: 'p',
      text: t,
      italic:
        pCls.includes('legend') ||
        pCls.includes('footer-note') ||
        pCls.includes('acceptance') ||
        !!$el.find('em').length,
      bold: !!$el.find('strong').length && $el.find('strong').text().trim() === t,
      center: pCls.includes('entity-name') || ($el.attr('style') || '').includes('text-align:center'),
      small: pCls.includes('legend') || pCls.includes('footer-note') || pCls.includes('ra-signature-label'),
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
          // <br/> becomes nothing in .text() - insert separators so
          // "St<br/>Suite" doesn't render as "StSuite".
          const $cell = $(cell).clone();
          $cell.find('br').replaceWith(', ');
          cells.push(normalizeText($cell.text()).replace(/,\s*,/g, ','));
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
  if (tag === 'div' || tag === 'section' || tag === 'span') {
    const kids = $el.children();
    if (kids.length) {
      kids.each((__, child) => walk($, child, blocks));
    } else {
      const t = normalizeText($el.text());
      if (t) {
        blocks.push({
          kind: 'p',
          text: t,
          bold: cls.includes('signature-name'),
          small: cls.includes('ra-signature-label') || cls.includes('legend'),
        });
      }
    }
    return;
  }

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

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

function measureBlock(block: Block, fonts: Fonts): number {
  if (block.kind === 'spacer') return block.height;
  if (block.kind === 'hr') return 16;
  if (block.kind === 'h1') {
    const lines = wrapLines(block.text.toUpperCase(), fonts.bold, 16, CONTENT_WIDTH);
    return 8 + lines.length * 20 + 4;
  }
  if (block.kind === 'h2') {
    const lines = wrapLines(block.text, fonts.italic, 12, CONTENT_WIDTH);
    return lines.length * 16 + 10;
  }
  if (block.kind === 'h3') {
    const lines = wrapLines(block.text, fonts.bold, 12, CONTENT_WIDTH);
    return 10 + lines.length * 16 + 8;
  }
  if (block.kind === 'p') {
    const f = block.bold ? fonts.bold : block.italic ? fonts.italic : fonts.regular;
    const size = block.small ? 9 : 11;
    const lineGap = block.small ? 12 : 15;
    const lines = wrapLines(block.text, f, size, CONTENT_WIDTH);
    return lines.length * lineGap + 4;
  }
  if (block.kind === 'badge') return 70;
  if (block.kind === 'table') {
    const colCount = Math.max(...block.rows.map((r) => r.length), 1);
    const colW = CONTENT_WIDTH / colCount;
    let h = 4;
    for (const row of block.rows) {
      const cellLines = row.map((cell) => wrapLines(cell || '-', fonts.regular, 10, colW - 10));
      h += Math.max(...cellLines.map((l) => l.length), 1) * 13 + 8 + 2;
    }
    return h + 8;
  }
  if (block.kind === 'group') {
    return block.blocks.reduce((sum, b) => sum + measureBlock(b, fonts), 0);
  }
  return 0;
}

export async function htmlDocumentToPdf(html: string, title = 'Document'): Promise<Uint8Array> {
  const $ = load(html);
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
  const fonts: Fonts = { regular: font, bold: fontBold, italic: fontItalic };

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
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
    const color = opts.color ?? { r: 0.07, g: 0.07, b: 0.07 };
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

  const drawBlock = (block: Block) => {
    if (block.kind === 'group') {
      const height = measureBlock(block, fonts);
      const usable = PAGE_HEIGHT - MARGIN - BOTTOM;
      // If the whole article fits on a page but not in the remaining space,
      // start a fresh page so Article IV (etc.) is not split mid-section.
      if (height <= usable && y - height < BOTTOM) {
        newPage();
      }
      for (const child of block.blocks) drawBlock(child);
      return;
    }
    if (block.kind === 'spacer') {
      y -= block.height;
      return;
    }
    if (block.kind === 'hr') {
      ensureSpace(16);
      page.drawLine({
        start: { x: MARGIN, y: y - 4 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 4 },
        thickness: 0.75,
        color: rgb(0.35, 0.35, 0.35),
      });
      y -= 16;
      return;
    }
    if (block.kind === 'h1') {
      y -= 8;
      drawWrapped(block.text.toUpperCase(), {
        size: 15,
        font: fontBold,
        center: true,
        lineGap: 19,
      });
      y -= 4;
      return;
    }
    if (block.kind === 'h2') {
      drawWrapped(block.text, {
        size: 11,
        font: fontItalic,
        center: true,
        lineGap: 15,
        color: { r: 0.2, g: 0.2, b: 0.2 },
      });
      y -= 8;
      return;
    }
    if (block.kind === 'h3') {
      y -= 8;
      ensureSpace(36);
      drawWrapped(block.text, { size: 11.5, font: fontBold, lineGap: 15 });
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: PAGE_WIDTH - MARGIN, y: y + 2 },
        thickness: 0.7,
        color: rgb(0.12, 0.12, 0.12),
      });
      y -= 6;
      return;
    }
    if (block.kind === 'p') {
      const f = block.bold ? fontBold : block.italic ? fontItalic : font;
      drawWrapped(block.text, {
        size: block.small ? 9 : 11,
        font: f,
        center: block.center,
        lineGap: block.small ? 12 : 14.5,
        color: block.small
          ? { r: 0.3, g: 0.3, b: 0.3 }
          : { r: 0.07, g: 0.07, b: 0.07 },
      });
      y -= 3;
      return;
    }
    if (block.kind === 'badge') {
      ensureSpace(70);
      const boxH = 56;
      const fill =
        block.tone === 'warn' ? rgb(0.996, 0.953, 0.78) : rgb(0.93, 0.97, 0.95);
      const stroke =
        block.tone === 'warn' ? rgb(0.705, 0.325, 0.035) : rgb(0.043, 0.478, 0.42);
      page.drawRectangle({
        x: PAGE_WIDTH - MARGIN - 200,
        y: y - boxH,
        width: 200,
        height: boxH,
        borderColor: stroke,
        borderWidth: 1.25,
        color: fill,
      });
      page.drawText(block.title.toUpperCase(), {
        x: PAGE_WIDTH - MARGIN - 190,
        y: y - 18,
        size: 9,
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
      return;
    }
    if (block.kind === 'table') {
      const colCount = Math.max(...block.rows.map((r) => r.length), 1);
      const colW = CONTENT_WIDTH / colCount;
      y -= 4;
      for (const row of block.rows) {
        const cellLines = row.map((cell) => wrapLines(cell || '-', font, 10, colW - 10));
        const rowHeight = Math.max(...cellLines.map((l) => l.length), 1) * 13 + 8;
        ensureSpace(rowHeight + 2);
        for (let i = 0; i < colCount; i++) {
          const lines = cellLines[i] ?? ['-'];
          let cy = y - 12;
          for (const line of lines) {
            page.drawText(line, {
              x: MARGIN + i * colW + 4,
              y: cy,
              size: 10,
              font: i === 0 && row.length > 1 ? fontBold : font,
              color: rgb(0.07, 0.07, 0.07),
            });
            cy -= 13;
          }
        }
        y -= rowHeight;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.35,
          color: rgb(0.85, 0.85, 0.85),
        });
        y -= 2;
      }
      y -= 6;
    }
  };

  for (const block of blocks) drawBlock(block);

  if (pdf.getPageCount() === 0) {
    const p: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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

/** Merge multiple PDF byte arrays into one document (cover page first, etc.). */
export async function mergePdfDocuments(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setProducer('LaunchForma');
  out.setCreator('LaunchForma');
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}
