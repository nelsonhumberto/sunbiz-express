// Document generator. For demo purposes we produce HTML "documents" base64-encoded.
// In production this would be @react-pdf/renderer or WeasyPrint generating real PDFs.

import { formatCurrency, formatDateLong, safeParseJson } from './utils';
import type { AddressInput } from './florida';
import { FL } from './florida';

interface FilingForDoc {
  id: string;
  businessName: string;
  entityType: 'LLC' | 'CORP';
  principalAddress: AddressInput | null;
  mailingAddress: AddressInput | string | null;
  registeredAgent: {
    name: string;
    email?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    signature?: string;
    signedAt?: string;
  } | null;
  managersMembers: {
    title: string;
    name: string;
    street1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }[];
  correspondenceContact: { email?: string; phone?: string } | null;
  optionalDetails: {
    effectiveDate?: string;
    authorizedShares?: number;
    professionalPurpose?: string;
    businessPurpose?: string;
  } | null;
  incorporatorSignature: string | null;
  incorporatorSignedAt: Date | null;
  sunbizFilingNumber: string | null;
  submittedAt: Date | null;
}

// ─── Helper to wrap HTML as a styled "document" ───────────────────────────

function docShell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>
    @page { size: letter; margin: 1in; }
    body { font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.6; color: #0F1F1C; max-width: 8.5in; margin: 1in auto; padding: 0 1in; background: #fff; }
    h1 { font-size: 18pt; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; font-weight: bold; }
    h2 { font-size: 13pt; text-align: center; margin: 0 0 32px; font-weight: normal; font-style: italic; }
    h3 { font-size: 13pt; margin: 24px 0 8px; font-weight: bold; border-bottom: 1px solid #0F1F1C; padding-bottom: 4px; }
    p { margin: 8px 0; }
    .article { margin: 16px 0; }
    .article-title { font-weight: bold; }
    .signature-block { margin-top: 48px; padding-top: 24px; border-top: 1px solid #475A56; }
    .signature-line { display: flex; justify-content: space-between; margin: 24px 0 4px; }
    .signature-name { font-family: 'Brush Script MT', cursive; font-size: 18pt; color: #0B7A6B; }
    .filing-stamp { float: right; border: 2px solid #0B7A6B; padding: 8px 16px; font-family: 'Inter', sans-serif; color: #0B7A6B; font-size: 9pt; transform: rotate(-3deg); margin-bottom: 16px; }
    .filing-stamp h4 { margin: 0; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { padding: 6px 8px; vertical-align: top; }
    .label { font-weight: bold; width: 30%; }
    .footer-note { margin-top: 32px; font-size: 9pt; color: #475A56; text-align: center; font-style: italic; }
    .seal { display: block; margin: 16px auto; width: 96px; height: 96px; border: 3px double #0B7A6B; border-radius: 50%; text-align: center; line-height: 1.3; padding: 16px 8px; font-size: 8pt; color: #0B7A6B; font-weight: bold; }
    .gold-border { border: 2px solid #D4AF37; padding: 12px; }
  </style></head><body>${body}</body></html>`;
}

// ─── Articles of Organization (LLC) ───────────────────────────────────────

export function generateArticlesOfOrganization(filing: FilingForDoc): string {
  const ra = filing.registeredAgent;
  const principal = filing.principalAddress;
  const mailing =
    typeof filing.mailingAddress === 'string' ? principal : filing.mailingAddress;
  const opt = filing.optionalDetails;
  const effective = opt?.effectiveDate
    ? formatDateLong(new Date(opt.effectiveDate))
    : 'Date of filing';

  const html = `
    <div class="filing-stamp">
      <h4>FILED</h4>
      <div>${filing.submittedAt ? formatDateLong(filing.submittedAt) : 'Pending'}</div>
      <div>FL Dept. of State</div>
      <div>${filing.sunbizFilingNumber ?? 'L20260000000'}</div>
    </div>
    <h1>Articles of Organization</h1>
    <h2>For Florida Limited Liability Company</h2>
    <p>Pursuant to s.605.0201 of the Florida Statutes, the undersigned, desiring to form a limited liability company under the laws of the State of Florida, hereby submits the following Articles of Organization:</p>

    <h3>Article I — Name</h3>
    <p>The name of the limited liability company is:</p>
    <p style="text-align:center; font-weight:bold; font-size:14pt;">${escapeHtml(filing.businessName)}</p>

    <h3>Article II — Principal Place of Business</h3>
    <p>The principal place of business of the limited liability company is:</p>
    ${addressBlock(principal)}

    <h3>Article III — Mailing Address</h3>
    ${addressBlock(mailing)}

    <h3>Article IV — Registered Agent</h3>
    <p>The name and Florida street address of the registered agent is:</p>
    <table>
      <tr><td class="label">Name</td><td>${escapeHtml(ra?.name ?? '')}</td></tr>
      <tr><td class="label">Street Address</td><td>${addressLines(ra)}</td></tr>
    </table>
    <p style="margin-top:16px;"><em>Having been named as registered agent and to accept service of process for the above stated limited liability company at the place designated in this certificate, I hereby accept the appointment as registered agent and agree to act in this capacity. I further agree to comply with the provisions of all statutes relating to the proper and complete performance of my duties, and I am familiar with and accept the obligations of my position as registered agent.</em></p>
    <div class="signature-line">
      <span><span class="signature-name">${escapeHtml(ra?.signature ?? ra?.name ?? '')}</span><br/>Registered Agent Signature</span>
      <span>Date: ${ra?.signedAt ? formatDateLong(new Date(ra.signedAt)) : 'Date of filing'}</span>
    </div>

    ${
      filing.managersMembers.length > 0
        ? `<h3>Article V — Authorized Persons</h3>
        <table>
          <tr><td class="label">Title</td><td class="label">Name</td><td class="label">Address</td></tr>
          ${filing.managersMembers
            .map(
              (m) => `<tr><td>${escapeHtml(m.title)}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml([m.street1, m.city, m.state, m.zip].filter(Boolean).join(', '))}</td></tr>`
            )
            .join('')}
        </table>`
        : ''
    }

    <h3>Article VI — Effective Date</h3>
    <p>${effective}</p>

    ${opt?.businessPurpose ? `<h3>Article VII — Business Purpose</h3><p>${escapeHtml(opt.businessPurpose)}</p>` : ''}

    <div class="signature-block">
      <p><strong>Signature of Authorized Person:</strong></p>
      <div class="signature-line">
        <span class="signature-name">${escapeHtml(filing.incorporatorSignature ?? '')}</span>
        <span>Date: ${filing.incorporatorSignedAt ? formatDateLong(filing.incorporatorSignedAt) : 'Date of filing'}</span>
      </div>
      <p style="font-size:9pt; color:#475A56;">By submitting this document electronically, the undersigned affirms that the foregoing facts are true and that this electronic signature is intended to be the legal equivalent of a handwritten signature.</p>
    </div>

    <p class="footer-note">Filed pursuant to Chapter 605, Florida Statutes — Florida Department of State, Division of Corporations.</p>
  `;
  return docShell('Articles of Organization', html);
}

// ─── Articles of Incorporation (Corporation) ──────────────────────────────

export function generateArticlesOfIncorporation(filing: FilingForDoc): string {
  const ra = filing.registeredAgent;
  const principal = filing.principalAddress;
  const opt = filing.optionalDetails;

  const html = `
    <div class="filing-stamp">
      <h4>FILED</h4>
      <div>${filing.submittedAt ? formatDateLong(filing.submittedAt) : 'Pending'}</div>
      <div>FL Dept. of State</div>
      <div>${filing.sunbizFilingNumber ?? 'P26000000000'}</div>
    </div>
    <h1>Articles of Incorporation</h1>
    <h2>For Florida Profit Corporation</h2>
    <p>Pursuant to s.607.0202 of the Florida Statutes, the undersigned hereby submits these Articles of Incorporation:</p>

    <h3>Article I — Name</h3>
    <p style="text-align:center; font-weight:bold; font-size:14pt;">${escapeHtml(filing.businessName)}</p>

    <h3>Article II — Principal Office</h3>
    ${addressBlock(principal)}

    <h3>Article III — Number of Shares</h3>
    <p>The number of shares of stock that this corporation is authorized to issue is: <strong>${opt?.authorizedShares ?? 1000}</strong> shares of common stock.</p>

    <h3>Article IV — Registered Agent</h3>
    <table>
      <tr><td class="label">Name</td><td>${escapeHtml(ra?.name ?? '')}</td></tr>
      <tr><td class="label">Street Address</td><td>${addressLines(ra)}</td></tr>
    </table>
    <p><em>${escapeHtml(ra?.name ?? '')} hereby accepts the appointment as registered agent.</em></p>

    <h3>Article V — Incorporator</h3>
    <p>${escapeHtml(filing.incorporatorSignature ?? 'Authorized Person')}</p>

    <div class="signature-block">
      <div class="signature-line">
        <span class="signature-name">${escapeHtml(filing.incorporatorSignature ?? '')}</span>
        <span>Date: ${filing.incorporatorSignedAt ? formatDateLong(filing.incorporatorSignedAt) : 'Date of filing'}</span>
      </div>
    </div>

    <p class="footer-note">Filed pursuant to Chapter 607, Florida Statutes.</p>
  `;
  return docShell('Articles of Incorporation', html);
}

// ─── Operating Agreement (single-member, simplified) ──────────────────────

export function generateOperatingAgreement(filing: FilingForDoc): string {
  const member = filing.managersMembers[0];
  const memberCount = filing.managersMembers.length;
  const title = memberCount > 1 ? 'Multi-Member Operating Agreement' : 'Single-Member Operating Agreement';
  const today = formatDateLong(new Date());

  const html = `
    <h1>Operating Agreement</h1>
    <h2>${title} of ${escapeHtml(filing.businessName)}</h2>

    <p>This Operating Agreement (this "Agreement") of <strong>${escapeHtml(filing.businessName)}</strong> (the "Company"), a Florida limited liability company, is entered into as of ${today}, by and among the Company and the Member(s) listed below.</p>

    <h3>1. Formation</h3>
    <p>The Company was organized as a Florida limited liability company on ${filing.submittedAt ? formatDateLong(filing.submittedAt) : 'the date of filing'} by the filing of Articles of Organization with the Florida Department of State pursuant to Chapter 605 of the Florida Statutes.</p>

    <h3>2. Name and Principal Office</h3>
    <p>The name of the Company is <strong>${escapeHtml(filing.businessName)}</strong>. The principal office is located at:</p>
    ${addressBlock(filing.principalAddress)}

    <h3>3. Members</h3>
    <table>
      <tr><td class="label">Name</td><td class="label">Ownership %</td></tr>
      ${filing.managersMembers
        .map(
          (m) => `<tr><td>${escapeHtml(m.name)}</td><td>—</td></tr>`
        )
        .join('')}
    </table>

    <h3>4. Management</h3>
    <p>The Company shall be ${memberCount > 1 ? 'manager-managed' : 'member-managed'}. The Members shall have the authority to bind the Company in the ordinary course of its business.</p>

    <h3>5. Capital Contributions</h3>
    <p>Each Member has contributed cash, property, or services to the Company as of the date of this Agreement. No Member shall be required to make additional capital contributions without unanimous consent.</p>

    <h3>6. Distributions</h3>
    <p>Distributions shall be made to the Members in proportion to their ownership interests, at such times as determined by the Members.</p>

    <h3>7. Liability of Members</h3>
    <p>No Member shall be personally liable for any debt, obligation, or liability of the Company solely by reason of being a Member, except as required by Florida law.</p>

    <h3>8. Dissolution</h3>
    <p>The Company shall be dissolved upon the unanimous written consent of the Members or by operation of law.</p>

    <h3>9. Governing Law</h3>
    <p>This Agreement shall be governed by the laws of the State of Florida.</p>

    <div class="signature-block">
      <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>
      ${filing.managersMembers
        .map(
          (m) => `<div class="signature-line"><span><span class="signature-name">${escapeHtml(m.name)}</span><br/>${escapeHtml(m.name)}, Member</span><span>Date: ${today}</span></div>`
        )
        .join('')}
    </div>

    <p class="footer-note">DISCLAIMER: This Operating Agreement is provided as a convenience based on information you supplied. Sunbiz Express is not a law firm and does not provide legal advice. We recommend reviewing this document with an attorney before relying on it for material business decisions.</p>
  `;
  return docShell('Operating Agreement', html);
}

// ─── Receipt ──────────────────────────────────────────────────────────────

export function generateReceipt(args: {
  filingId: string;
  businessName: string;
  totalCents: number;
  lines: { label: string; cents: number }[];
  paidAt: Date;
  cardLast4?: string;
}): string {
  const html = `
    <h1>Payment Receipt</h1>
    <h2>${escapeHtml(args.businessName)}</h2>

    <table>
      <tr><td class="label">Filing ID</td><td><code>${escapeHtml(args.filingId)}</code></td></tr>
      <tr><td class="label">Paid On</td><td>${formatDateLong(args.paidAt)}</td></tr>
      ${args.cardLast4 ? `<tr><td class="label">Payment Method</td><td>•••• ${escapeHtml(args.cardLast4)}</td></tr>` : ''}
    </table>

    <h3>Itemized</h3>
    <table>
      ${args.lines
        .map(
          (l) =>
            `<tr><td>${escapeHtml(l.label)}</td><td style="text-align:right;">${formatCurrency(l.cents, { showZero: true })}</td></tr>`
        )
        .join('')}
      <tr><td style="font-weight:bold; border-top:2px solid #0F1F1C;">Total</td><td style="text-align:right; font-weight:bold; border-top:2px solid #0F1F1C;">${formatCurrency(args.totalCents, { showZero: true })}</td></tr>
    </table>

    <p class="footer-note">Sunbiz Express · 1234 Sunshine Blvd, Miami FL 33101 · support@sunbizexpress.example</p>
  `;
  return docShell('Receipt', html);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function addressLines(addr: AddressInput | { street1?: string; street2?: string; city?: string; state?: string; zip?: string } | null | undefined): string {
  if (!addr) return '';
  const a = addr as AddressInput;
  const parts: string[] = [];
  if (a.street1) parts.push(escapeHtml(a.street1));
  if (a.street2) parts.push(escapeHtml(a.street2));
  parts.push(escapeHtml(`${a.city ?? ''}, ${a.state ?? ''} ${a.zip ?? ''}`.trim()));
  return parts.join('<br/>');
}

function addressBlock(addr: AddressInput | string | null | undefined): string {
  if (!addr) return '<p>—</p>';
  if (typeof addr === 'string') return `<p>${escapeHtml(addr)}</p>`;
  return `<p>${addressLines(addr)}</p>`;
}

// ─── Encode to base64 for storage ─────────────────────────────────────────

export function encodeDocument(html: string): string {
  return Buffer.from(html, 'utf-8').toString('base64');
}

export function decodeDocument(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}
