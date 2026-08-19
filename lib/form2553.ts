import 'server-only';

import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

/**
 * Fills the official IRS Form 2553 (Rev. 12-2017) AcroForm using pdf-lib.
 *
 * Field names were discovered by inspecting data/forms/f2553.pdf. The Part I/J
 * shareholder table has 7 rows × 7 columns; column order (by x-position) is:
 *   0 name+address · 1 consent signature · 2 consent date · 3 shares/% ·
 *   4 date(s) acquired · 5 SSN/EIN · 6 tax-year-end.
 *
 * The corporation EIN and the wet signatures are intentionally left blank - the
 * officer/shareholders sign and the EIN is added before filing with the IRS.
 */

const P1 = 'topmostSubform[0].Page1[0].';
const NA = `${P1}NameAddress[0].`;
const P2 = 'topmostSubform[0].Page2[0].';

export interface Form2553Shareholder {
  name: string;
  address?: string;
  shares?: string; // "1,000" or "100%"
  datesAcquired?: string;
  /** Full SSN/EIN (decrypted) - required by the IRS form. */
  taxId?: string;
  taxYearEnd?: string; // "12/31"
}

export interface Form2553PdfArgs {
  businessName: string;
  street?: string;
  cityStateZip?: string;
  stateOfIncorporation?: string;
  dateIncorporated?: string;
  effectiveDate?: string;
  officerName?: string;
  officerTitle?: string;
  officerPhone?: string;
  signDate?: string;
  shareholders: Form2553Shareholder[];
}

function rowFieldName(row: number, col: number): string {
  // Row1 → f2_03..f2_09, Row2 → f2_10..f2_16, … Row7 → f2_45..f2_51.
  const n = 3 + (row - 1) * 7 + col;
  return `${P2}Table_Part1[0].Row${row}[0].f2_${String(n).padStart(2, '0')}[0]`;
}

export async function generateForm2553Pdf(args: Form2553PdfArgs): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'data', 'forms', 'f2553.pdf');
  const template = fs.readFileSync(templatePath);
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();

  const setText = (name: string, value?: string | null) => {
    if (!value) return;
    try {
      form.getTextField(name).setText(value);
    } catch {
      /* field absent in this revision - skip */
    }
  };
  const check = (name: string) => {
    try {
      form.getCheckBox(name).check();
    } catch {
      /* skip */
    }
  };

  // ── Page 1 - Part I Election Information ──────────────────────────────
  setText(`${NA}f1_01[0]`, args.businessName);
  setText(`${NA}f1_02[0]`, args.street);
  setText(`${NA}f1_03[0]`, args.cityStateZip);
  // f1_04 = A (EIN) - left blank intentionally.
  setText(`${P1}f1_05[0]`, args.dateIncorporated); // B Date incorporated
  setText(`${P1}f1_06[0]`, args.stateOfIncorporation); // C State of incorporation
  setText(`${P1}f1_07[0]`, args.effectiveDate); // E Election effective date
  check(`${P1}c1_3[0]`); // F(1) Calendar year (default)
  setText(`${P1}f1_10[0]`, // H Name and title of officer
    [args.officerName, args.officerTitle].filter(Boolean).join(', '));
  setText(`${P1}f1_11[0]`, args.officerPhone); // H Telephone
  setText(`${P1}f1_21[0]`, args.signDate); // Sign Here - Date

  // ── Page 2 - continued header + Part I item J shareholder table ───────
  setText(`${P2}f2_01[0]`, args.businessName); // Name (continued)
  // f2_02 = EIN (continued) - blank.

  args.shareholders.slice(0, 7).forEach((sh, i) => {
    const row = i + 1;
    const nameAddr = [sh.name, sh.address].filter(Boolean).join(' · ');
    setText(rowFieldName(row, 0), nameAddr); // J name & address
    // col 1 (consent signature) + col 2 (consent date) left blank for signing.
    setText(rowFieldName(row, 3), sh.shares); // L number of shares / %
    setText(rowFieldName(row, 4), sh.datesAcquired); // L date(s) acquired
    setText(rowFieldName(row, 5), sh.taxId); // M SSN/EIN
    setText(rowFieldName(row, 6), sh.taxYearEnd); // N tax year ends
  });

  // Keep fields editable so an admin can tweak before sending to the customer.
  form.updateFieldAppearances();
  return doc.save();
}
