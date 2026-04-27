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
    useOurService?: boolean;
  } | null;
  managersMembers: {
    title: string;
    name: string;
    street1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    ownershipPercentage?: number | null;
  }[];
  correspondenceContact: { email?: string; phone?: string } | null;
  optionalDetails: {
    effectiveDate?: string;
    authorizedShares?: number;
    professionalPurpose?: string;
    businessPurpose?: string;
    managementType?: 'member-managed' | 'manager-managed';
  } | null;
  incorporatorSignature: string | null;
  incorporatorSignedAt: Date | null;
  sunbizFilingNumber: string | null;
  sunbizApprovedAt?: Date | null;
  submittedAt: Date | null;
}

// Internal officer who signs as our Registered Agent on filings where the
// customer chose IncServices RA Services LLC. The customer never sees this
// name in the wizard; it appears only on the executed Articles.
const INTERNAL_RA_OFFICER_NAME = 'Maria Acosta';
const INTERNAL_RA_OFFICER_TITLE = 'Authorized Signer';

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
    .pending-badge { float: right; border: 1px dashed #B45309; padding: 6px 12px; font-family: 'Inter', sans-serif; color: #B45309; background: #FEF3C7; font-size: 9pt; margin-bottom: 16px; max-width: 220px; }
    .pending-badge strong { display: block; font-size: 10pt; }
    .legend { font-size: 9pt; color: #475A56; margin: 4px 0 12px; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td { padding: 6px 8px; vertical-align: top; }
    .label { font-weight: bold; width: 30%; }
    .footer-note { margin-top: 32px; font-size: 9pt; color: #475A56; text-align: center; font-style: italic; }
    .seal { display: block; margin: 16px auto; width: 96px; height: 96px; border: 3px double #0B7A6B; border-radius: 50%; text-align: center; line-height: 1.3; padding: 16px 8px; font-size: 8pt; color: #0B7A6B; font-weight: bold; }
    .gold-border { border: 2px solid #D4AF37; padding: 12px; }
  </style></head><body>${body}</body></html>`;
}

/**
 * Filing-status header rendered at the top of the Articles. Florida only
 * applies a real "FILED" stamp + filing number once the document has been
 * accepted by the Department of State. Until then we render a clearly
 * non-binding "submitted, awaiting approval" badge instead of a fake stamp.
 */
function filingStatusHeader(filing: FilingForDoc): string {
  if (filing.sunbizFilingNumber) {
    const date = filing.sunbizApprovedAt ?? filing.submittedAt;
    return `
      <div class="filing-stamp">
        <h4>FILED</h4>
        <div>${date ? formatDateLong(date) : ''}</div>
        <div>FL Dept. of State</div>
        <div>${escapeHtml(filing.sunbizFilingNumber)}</div>
      </div>
    `;
  }
  return `
    <div class="pending-badge">
      <strong>SUBMITTED</strong>
      <div>Awaiting Florida Department of State approval. The official filing number will appear here once issued.</div>
    </div>
  `;
}

/**
 * Renders the registered agent acceptance signature block. When the customer
 * picked IncServices as their Registered Agent, the agent (us) signs by an
 * internal authorized officer — the customer never types it. Otherwise we
 * print the externally-typed signature.
 */
function raAcceptanceBlock(ra: FilingForDoc['registeredAgent']): string {
  if (!ra) return '';
  const date = ra.signedAt ? formatDateLong(new Date(ra.signedAt)) : 'Date of filing';
  if (ra.useOurService) {
    return `
      <div class="signature-line">
        <span>
          <span class="signature-name">${escapeHtml(`${ra.name}, by ${INTERNAL_RA_OFFICER_NAME}`)}</span>
          <br/>Registered Agent's Signature (REQUIRED) — ${escapeHtml(ra.name)}, by ${escapeHtml(INTERNAL_RA_OFFICER_NAME)}, ${escapeHtml(INTERNAL_RA_OFFICER_TITLE)}
        </span>
        <span>Date: ${date}</span>
      </div>
    `;
  }
  return `
    <div class="signature-line">
      <span>
        <span class="signature-name">${escapeHtml(ra.signature ?? ra.name)}</span>
        <br/>Registered Agent's Signature (REQUIRED)
      </span>
      <span>Date: ${date}</span>
    </div>
  `;
}

// ─── Articles of Organization (LLC) ───────────────────────────────────────

export function generateArticlesOfOrganization(filing: FilingForDoc): string {
  const ra = filing.registeredAgent;
  const principal = filing.principalAddress;
  const mailing =
    typeof filing.mailingAddress === 'string' || filing.mailingAddress == null
      ? principal
      : filing.mailingAddress;
  const opt = filing.optionalDetails;

  // Authorized-persons table (Article IV) — the section is OPTIONAL on
  // CR2E047, but most banks and the Department of Financial Services rely on
  // it, so we render whatever the user supplied.
  const authorizedPersons =
    filing.managersMembers.length > 0
      ? `<table>
          <tr><td class="label">Title</td><td class="label">Name</td><td class="label">Address</td></tr>
          ${filing.managersMembers
            .map(
              (m) =>
                `<tr><td>${escapeHtml(m.title)}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(
                  [m.street1, m.city, m.state, m.zip].filter(Boolean).join(', '),
                )}</td></tr>`,
            )
            .join('')}
        </table>
        <p class="legend">Title key — AMBR: Authorized Member · MGR: Manager · MGRM: Managing Member.</p>`
      : '<p><em>No authorized persons listed at filing. (Optional under s.605.0201 — most banks require this section to open accounts.)</em></p>';

  const otherProvisions = opt?.businessPurpose
    ? `<h3>Article VI — Other Provisions</h3><p>${escapeHtml(opt.businessPurpose)}</p>`
    : '';

  const html = `
    ${filingStatusHeader(filing)}
    <h1>Articles of Organization</h1>
    <h2>For Florida Limited Liability Company</h2>
    <p>Pursuant to s.605.0201 of the Florida Statutes, the undersigned, desiring to form a limited liability company under the laws of the State of Florida, hereby submits the following Articles of Organization:</p>

    <h3>Article I — Name</h3>
    <p>The name of the limited liability company is:</p>
    <p style="text-align:center; font-weight:bold; font-size:14pt;">${escapeHtml(filing.businessName)}</p>

    <h3>Article II — Address</h3>
    <table>
      <tr>
        <td class="label">Principal Office Address</td>
        <td>${addressLines(principal)}</td>
      </tr>
      <tr>
        <td class="label">Mailing Address</td>
        <td>${addressLines(mailing)}</td>
      </tr>
    </table>

    <h3>Article III — Registered Agent, Registered Office, &amp; Registered Agent's Signature</h3>
    <p>The Limited Liability Company cannot serve as its own Registered Agent. The name and the Florida street address of the registered agent are:</p>
    <table>
      <tr><td class="label">Name</td><td>${escapeHtml(ra?.name ?? '')}</td></tr>
      <tr><td class="label">Florida Street Address</td><td>${addressLines(ra)}</td></tr>
    </table>
    <p style="margin-top:16px;"><em>Having been named as registered agent and to accept service of process for the above stated limited liability company at the place designated in this certificate, I hereby accept the appointment as registered agent and agree to act in this capacity. I further agree to comply with the provisions of all statutes relating to the proper and complete performance of my duties, and I am familiar with and accept the obligations of my position as registered agent as provided for in Chapter 605, Florida Statutes.</em></p>
    ${raAcceptanceBlock(ra)}

    <h3>Article IV — Authorized Persons</h3>
    <p>The name and address of each person authorized to manage and control the Limited Liability Company:</p>
    ${authorizedPersons}

    <h3>Article V — Effective Date</h3>
    <p>${
      opt?.effectiveDate
        ? formatDateLong(new Date(opt.effectiveDate))
        : 'Effective on the date of filing.'
    }</p>

    ${otherProvisions}

    <div class="signature-block">
      <p><strong>Required Signature — Signature of a member or an authorized representative of a member:</strong></p>
      <div class="signature-line">
        <span class="signature-name">${escapeHtml(filing.incorporatorSignature ?? '')}</span>
        <span>Date: ${filing.incorporatorSignedAt ? formatDateLong(filing.incorporatorSignedAt) : 'Date of filing'}</span>
      </div>
      <p style="font-size:9pt; color:#475A56;">This document is executed in accordance with section 605.0203(1)(b), Florida Statutes. The undersigned is aware that any false information submitted in a document to the Department of State constitutes a third degree felony as provided for in s.817.155, Florida Statutes.</p>
    </div>

    <p class="footer-note">Filed pursuant to Chapter 605, Florida Statutes — Florida Department of State, Division of Corporations.</p>
  `;
  return docShell('Articles of Organization', html);
}

// ─── Articles of Incorporation (Corporation) ──────────────────────────────

export function generateArticlesOfIncorporation(filing: FilingForDoc): string {
  const ra = filing.registeredAgent;
  const principal = filing.principalAddress;
  const mailing =
    typeof filing.mailingAddress === 'string' || filing.mailingAddress == null
      ? principal
      : filing.mailingAddress;
  const opt = filing.optionalDetails;

  // Article V — Initial officers/directors. Optional under s.607.0202; we
  // render whatever the customer entered as initial directors/officers.
  const officers = filing.managersMembers
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.title)}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(
          [m.street1, m.city, m.state, m.zip].filter(Boolean).join(', '),
        )}</td></tr>`,
    )
    .join('');

  const officersBlock =
    filing.managersMembers.length > 0
      ? `<table>
          <tr><td class="label">Title</td><td class="label">Name</td><td class="label">Address</td></tr>
          ${officers}
        </table>
        <p class="legend">Title key — P: President · VP: Vice President · S: Secretary · T: Treasurer · D: Director.</p>`
      : '<p><em>None listed at filing. (Optional under s.607.0202.)</em></p>';

  const purpose = opt?.businessPurpose
    ? escapeHtml(opt.businessPurpose)
    : 'The general purpose for which this corporation is organized is to engage in any lawful act or activity for which corporations may be organized under Chapter 607 of the Florida Statutes.';

  const html = `
    ${filingStatusHeader(filing)}
    <h1>Articles of Incorporation</h1>
    <h2>For Florida Profit Corporation</h2>
    <p>Pursuant to s.607.0202 of the Florida Statutes, the undersigned, acting as incorporator, hereby submits these Articles of Incorporation:</p>

    <h3>Article I — Name</h3>
    <p style="text-align:center; font-weight:bold; font-size:14pt;">${escapeHtml(filing.businessName)}</p>

    <h3>Article II — Principal Office and Mailing Address</h3>
    <table>
      <tr><td class="label">Principal Office</td><td>${addressLines(principal)}</td></tr>
      <tr><td class="label">Mailing Address</td><td>${addressLines(mailing)}</td></tr>
    </table>

    <h3>Article III — Purpose</h3>
    <p>${purpose}</p>

    <h3>Article IV — Capital Stock</h3>
    <p>The number of shares of stock that this corporation is authorized to issue is: <strong>${opt?.authorizedShares ?? 1000}</strong> shares of common stock, all of one class.</p>

    <h3>Article V — Initial Officers and/or Directors</h3>
    ${officersBlock}

    <h3>Article VI — Registered Agent, Registered Office, &amp; Registered Agent's Signature</h3>
    <p>The Corporation cannot serve as its own Registered Agent. The name and the Florida street address of the registered agent are:</p>
    <table>
      <tr><td class="label">Name</td><td>${escapeHtml(ra?.name ?? '')}</td></tr>
      <tr><td class="label">Florida Street Address</td><td>${addressLines(ra)}</td></tr>
    </table>
    <p style="margin-top:16px;"><em>Having been named as registered agent and to accept service of process for the above stated corporation at the place designated in this certificate, I hereby accept the appointment as registered agent and agree to act in this capacity. I further agree to comply with the provisions of all statutes relating to the proper and complete performance of my duties, and I am familiar with and accept the obligations of my position as registered agent as provided for in Chapter 607, Florida Statutes.</em></p>
    ${raAcceptanceBlock(ra)}

    <h3>Article VII — Effective Date</h3>
    <p>${
      opt?.effectiveDate
        ? formatDateLong(new Date(opt.effectiveDate))
        : 'Effective on the date of filing.'
    }</p>

    <h3>Article VIII — Incorporator</h3>
    <p>The name and address of the incorporator is: <strong>${escapeHtml(filing.incorporatorSignature ?? 'Authorized Person')}</strong>${principal ? `, ${escapeHtml([principal.street1, principal.city, principal.state, principal.zip].filter(Boolean).join(', '))}` : ''}.</p>

    <div class="signature-block">
      <p><strong>Required Signature — Incorporator:</strong></p>
      <div class="signature-line">
        <span class="signature-name">${escapeHtml(filing.incorporatorSignature ?? '')}</span>
        <span>Date: ${filing.incorporatorSignedAt ? formatDateLong(filing.incorporatorSignedAt) : 'Date of filing'}</span>
      </div>
      <p style="font-size:9pt; color:#475A56;">The undersigned is aware that any false information submitted in a document to the Department of State constitutes a third degree felony as provided for in s.817.155, Florida Statutes.</p>
    </div>

    <p class="footer-note">Filed pursuant to Chapter 607, Florida Statutes — Florida Department of State, Division of Corporations.</p>
  `;
  return docShell('Articles of Incorporation', html);
}

// ─── Operating Agreement (single- or multi-member) ────────────────────────

export function generateOperatingAgreement(filing: FilingForDoc): string {
  const memberCount = filing.managersMembers.length;
  const isMulti = memberCount > 1;
  const title = isMulti ? 'Multi-Member Operating Agreement' : 'Single-Member Operating Agreement';
  const today = formatDateLong(new Date());

  // Use the user-selected management type if available; otherwise fall back
  // to a sensible default (single-member is member-managed).
  const managementType =
    filing.optionalDetails?.managementType ?? (isMulti ? 'manager-managed' : 'member-managed');
  const managementLabel =
    managementType === 'manager-managed' ? 'manager-managed' : 'member-managed';

  // Compute ownership rows. If a single member with no recorded percentage,
  // assume 100%. Otherwise display the saved percentage (or "—" if missing).
  const ownershipRows = filing.managersMembers
    .map((m) => {
      let pct: string;
      if (m.ownershipPercentage != null) {
        pct = `${Number(m.ownershipPercentage).toFixed(2).replace(/\.00$/, '')}%`;
      } else if (!isMulti) {
        pct = '100%';
      } else {
        pct = '—';
      }
      return `<tr><td>${escapeHtml(m.name)}</td><td>${pct}</td></tr>`;
    })
    .join('');

  const managementClause = isMulti
    ? managementType === 'manager-managed'
      ? 'The Company shall be <strong>manager-managed</strong>. One or more Managers, designated by the Members, shall have authority to manage the day-to-day affairs of the Company. The Members, acting in their capacity as members, shall not have actual authority to bind the Company except as expressly granted by the Managers or this Agreement.'
      : 'The Company shall be <strong>member-managed</strong>. Each Member shall have authority to manage the Company\'s ordinary business affairs and to bind the Company in the ordinary course of business, subject to any restrictions in this Agreement.'
    : 'The Company shall be <strong>member-managed</strong> by its sole Member, who shall have full authority to manage the Company\'s affairs and to bind the Company.';

  const html = `
    <h1>Operating Agreement</h1>
    <h2>${title} of ${escapeHtml(filing.businessName)}</h2>

    <p>This Operating Agreement (this "Agreement") of <strong>${escapeHtml(filing.businessName)}</strong> (the "Company"), a Florida limited liability company, is entered into as of ${today}, by and among the Company and the Member(s) listed below.</p>

    <h3>1. Formation</h3>
    <p>The Company was organized as a Florida limited liability company on ${filing.submittedAt ? formatDateLong(filing.submittedAt) : 'the date of filing'} by the filing of Articles of Organization with the Florida Department of State pursuant to Chapter 605 of the Florida Statutes.</p>

    <h3>2. Name and Principal Office</h3>
    <p>The name of the Company is <strong>${escapeHtml(filing.businessName)}</strong>. The principal office is located at:</p>
    ${addressBlock(filing.principalAddress)}

    <h3>3. Members and Ownership</h3>
    <table>
      <tr><td class="label">Member Name</td><td class="label">Ownership %</td></tr>
      ${ownershipRows}
    </table>

    <h3>4. Management</h3>
    <p>${managementClause}</p>

    <h3>5. Capital Contributions</h3>
    <p>Each Member has contributed cash, property, or services to the Company as of the date of this Agreement in proportion to the ownership interest stated above. No Member shall be required to make additional capital contributions without ${isMulti ? 'unanimous consent' : 'their own consent'}.</p>

    <h3>6. Distributions and Allocations</h3>
    <p>Distributions and allocations of profits and losses shall be made to the Members in proportion to their ownership interests stated above, at such times and in such amounts as determined by ${managementLabel === 'manager-managed' ? 'the Managers' : 'the Members'}.</p>

    <h3>7. Liability of Members</h3>
    <p>No Member shall be personally liable for any debt, obligation, or liability of the Company solely by reason of being a Member, except as required by Florida law.</p>

    <h3>8. Dissolution</h3>
    <p>The Company shall be dissolved upon ${isMulti ? 'the written consent of Members holding more than fifty percent (50%) of the ownership interests' : 'the written election of the sole Member'} or by operation of law.</p>

    <h3>9. Governing Law</h3>
    <p>This Agreement shall be governed by the laws of the State of Florida.</p>

    <div class="signature-block">
      <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>
      ${filing.managersMembers
        .map(
          (m) =>
            `<div class="signature-line"><span><span class="signature-name">${escapeHtml(m.name)}</span><br/>${escapeHtml(m.name)}, Member</span><span>Date: ${today}</span></div>`,
        )
        .join('')}
    </div>

    <p class="footer-note">DISCLAIMER: This Operating Agreement is provided as a convenience based on information you supplied. IncServices is not a law firm and does not provide legal advice. We recommend reviewing this document with an attorney before relying on it for material business decisions.</p>
  `;
  return docShell('Operating Agreement', html);
}

// ─── Cover Letter (admin-only, for state submission) ──────────────────────
//
// Mirrors the cover sheet on form CR2E047. NEVER surfaced to the customer —
// it contains our internal handling info and the fee-checkbox section that
// Florida requires alongside the Articles. Generated at submit time and
// stored on the filing for the admin to print and mail.

export function generateCoverLetter(args: {
  filing: FilingForDoc;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  totalFeeCents: number;
  certificateOfStatus: boolean;
  certifiedCopy: boolean;
}): string {
  const subjectLine =
    args.filing.entityType === 'LLC'
      ? `Articles of Organization — ${args.filing.businessName}`
      : `Articles of Incorporation — ${args.filing.businessName}`;

  const baseFee = args.filing.entityType === 'LLC' ? FL.fees.llcTotal : FL.fees.corpTotal;
  const certStatusFee =
    args.filing.entityType === 'LLC'
      ? FL.fees.certificateOfStatusLLC
      : FL.fees.certificateOfStatusCorp;
  const certCopyFee =
    args.filing.entityType === 'LLC'
      ? FL.fees.certifiedCopyLLC
      : FL.fees.certifiedCopyCorp;

  // CR2E047 cover letter is a four-checkbox grid: base fee · base + status ·
  // base + copy · base + status + copy. We render it with the matching one
  // checked based on the customer's add-on selections.
  const checked = (on: boolean) => (on ? '☑' : '☐');
  const wantsBoth = args.certificateOfStatus && args.certifiedCopy;
  const wantsStatus = args.certificateOfStatus && !args.certifiedCopy;
  const wantsCopy = args.certifiedCopy && !args.certificateOfStatus;
  const wantsBase = !args.certificateOfStatus && !args.certifiedCopy;

  const html = `
    <h1>Cover Letter</h1>
    <h2>${escapeHtml(subjectLine)}</h2>

    <p><strong>TO:</strong> New Filing Section, Division of Corporations</p>
    <p><strong>SUBJECT:</strong> ${escapeHtml(args.filing.businessName)}</p>

    <p>The enclosed ${args.filing.entityType === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation'} and fee(s) are submitted for filing.</p>

    <p>Please return all correspondence concerning this matter to the following:</p>
    <table>
      <tr><td class="label">Name of Person</td><td>${escapeHtml(args.contactName)}</td></tr>
      <tr><td class="label">Firm / Company</td><td>${escapeHtml(args.filing.businessName)}</td></tr>
      <tr><td class="label">Address</td><td>${addressLines(args.filing.principalAddress)}</td></tr>
      <tr><td class="label">E-mail (annual report notification)</td><td>${escapeHtml(args.contactEmail)}</td></tr>
      <tr><td class="label">Daytime Telephone</td><td>${escapeHtml(args.contactPhone ?? '—')}</td></tr>
    </table>

    <p>Enclosed is a check (or filing-fee allotment) for the following amount:</p>
    <table>
      <tr>
        <td>${checked(wantsBase)} ${formatCurrency(baseFee, { showZero: true })} Filing Fee</td>
        <td>${checked(wantsStatus)} ${formatCurrency(baseFee + certStatusFee, { showZero: true })} Filing Fee &amp; Certificate of Status</td>
      </tr>
      <tr>
        <td>${checked(wantsCopy)} ${formatCurrency(baseFee + certCopyFee, { showZero: true })} Filing Fee &amp; Certified Copy</td>
        <td>${checked(wantsBoth)} ${formatCurrency(baseFee + certStatusFee + certCopyFee, { showZero: true })} Filing Fee, Certificate of Status &amp; Certified Copy</td>
      </tr>
    </table>

    <p style="margin-top:24px;"><strong>Total submitted with this cover letter:</strong> ${formatCurrency(args.totalFeeCents, { showZero: true })}</p>

    <p style="margin-top:32px;">
      <strong>Mailing Address</strong><br/>
      New Filing Section<br/>
      Division of Corporations<br/>
      P.O. Box 6327<br/>
      Tallahassee, FL 32314
    </p>
    <p>
      <strong>Street / Courier Address</strong><br/>
      New Filing Section, Division of Corporations<br/>
      The Centre of Tallahassee<br/>
      2415 N. Monroe Street, Suite 810<br/>
      Tallahassee, FL 32303
    </p>

    <p class="footer-note">INTERNAL — IncServices. This cover letter accompanies the Articles to the Florida Department of State and is not part of the customer's deliverable set.</p>
  `;
  return docShell('Cover Letter', html);
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

    <p style="margin-top:16px; font-size:12px; color:#525B5A;">
      Filing package pricing includes the required Florida Department of State filing
      fee and IncServices preparation and submission. IncServices remits the state
      filing fee to Florida on your behalf.
    </p>

    <p class="footer-note">IncServices · 1234 Sunshine Blvd, Miami FL 33101 · support@incservices.example</p>
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
