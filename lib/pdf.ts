// Document generator. For demo purposes we produce HTML "documents" base64-encoded.
// In production this would be @react-pdf/renderer or WeasyPrint generating real PDFs.

import { formatCurrency, formatDateLong, safeParseJson } from './utils';
import type { AddressInput } from './florida';
import {
  FORMATION_STATES,
  certificateOfStatusFeeCents,
  certifiedCopyFeeCents,
  formationDocumentLabel,
  getFormationState,
  stateFilingFeeCents,
  type FormationStateRule,
  type StateCode,
} from './formation-states';

export interface FilingForDoc {
  id: string;
  businessName: string;
  entityType: 'LLC' | 'CORP';
  /** USPS state code where the filing is being made. Defaults to FL. */
  state?: string | null;
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
    /** "individual" (default) or "business" — printed differently on Articles. */
    ownerType?: string | null;
    /** Business-owner legal name (when ownerType = "business"). */
    businessLegalName?: string | null;
    /** Business-owner state/country of formation. */
    businessJurisdiction?: string | null;
    /** Business-owner authorized signer / contact name. */
    signerName?: string | null;
  }[];
  correspondenceContact: { email?: string; phone?: string } | null;
  optionalDetails: {
    effectiveDate?: string;
    authorizedShares?: number;
    /** Delaware corp only: par value per share, in cents. */
    parValueCents?: number;
    professionalPurpose?: string;
    businessPurpose?: string;
    managementType?: 'member-managed' | 'manager-managed';
    /** Wyoming organizer email (printed on the Articles). */
    organizerEmail?: string;
    /** Wyoming consent for electronic service of process. */
    electronicServiceConsent?: boolean;
    /**
     * Delaware LLC only: whether to publicly disclose initial member
     * info on the filed Certificate of Formation. Defaults to false.
     */
    includeMembersOnArticles?: boolean;
    /** Customer-selected processing-speed option id (per state). */
    processingOption?: string;
    /** Customer indicated interest in foreign-state qualification. */
    foreignRegistrationInterest?: boolean;
  } | null;
  incorporatorSignature: string | null;
  incorporatorSignedAt: Date | null;
  sunbizFilingNumber: string | null;
  sunbizApprovedAt?: Date | null;
  submittedAt: Date | null;
}

/**
 * Resolve the formation state rule for a filing, defaulting to Florida.
 * Centralised here so callers don't need to know about the registry.
 */
function ruleFor(filing: FilingForDoc): FormationStateRule {
  return getFormationState(filing.state ?? 'FL');
}

// Internal officers who sign as our Registered Agent on filings where the
// customer chose LaunchForma's in-house RA. The customer never sees this
// name in the wizard; it appears only on the executed Articles. We pull
// these from the per-state registered agent profile so the right officer
// signs for FL/WY/DE.

// ─── Helper to wrap HTML as a styled "document" ───────────────────────────

function docShell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>
    @page { size: letter; margin: 0.85in; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; line-height: 1.45; color: #111; max-width: 7.5in; margin: 0.75in auto; padding: 0; background: #fff; }
    h1 { font-size: 15pt; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 6px; font-weight: bold; }
    h2 { font-size: 11pt; text-align: center; margin: 0 0 18px; font-weight: normal; font-style: italic; color: #333; }
    .entity-name { text-align: center; font-weight: bold; font-size: 13pt; margin: 10px 0 4px; letter-spacing: 0.01em; }
    .preamble { margin: 0 0 18px; text-align: justify; }
    section.article { margin: 0 0 14px; page-break-inside: avoid; break-inside: avoid; }
    h3 { font-size: 11.5pt; margin: 0 0 6px; font-weight: bold; border-bottom: 1px solid #222; padding-bottom: 3px; text-transform: none; }
    p { margin: 6px 0; text-align: justify; }
    .signature-block { margin-top: 28px; padding-top: 16px; border-top: 1px solid #444; page-break-inside: avoid; break-inside: avoid; }
    .signature-line { display: flex; justify-content: space-between; margin: 18px 0 4px; gap: 24px; }
    .signature-name { font-family: 'Times New Roman', Times, serif; font-size: 12pt; font-weight: bold; color: #111; text-decoration: underline; text-underline-offset: 4px; }
    .ra-signature-label { font-size: 10.5pt; margin-top: 4px; }
    .filing-stamp { float: right; border: 1.5px solid #0B7A6B; padding: 8px 12px; font-family: Georgia, serif; color: #0B7A6B; font-size: 8.5pt; margin: 0 0 12px 16px; max-width: 200px; }
    .filing-stamp h4 { margin: 0 0 2px; font-size: 10pt; letter-spacing: 0.06em; }
    .pending-badge { float: right; border: 1px solid #9A6B2F; padding: 6px 10px; font-family: Georgia, serif; color: #7A4E14; background: #FFF8EB; font-size: 8.5pt; margin: 0 0 12px 16px; max-width: 210px; }
    .pending-badge strong { display: block; font-size: 9.5pt; letter-spacing: 0.04em; }
    .legend { font-size: 9pt; color: #444; margin: 4px 0 8px; font-style: italic; text-align: left; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    td { padding: 5px 6px; vertical-align: top; border-bottom: 1px solid #e6e6e6; }
    .label { font-weight: bold; width: 32%; border-bottom: none; }
    .footer-note { margin-top: 24px; font-size: 8.5pt; color: #555; text-align: center; font-style: italic; }
    .acceptance { font-size: 10.5pt; font-style: italic; margin-top: 12px; text-align: justify; }
  </style></head><body>${body}</body></html>`;
}

/**
 * Filing-status header rendered at the top of the Articles. State Secretaries
 * of State only apply a real "FILED" stamp + filing number once the document
 * has been accepted. Until then we render a clearly non-binding "submitted,
 * awaiting approval" badge instead of a fake stamp.
 *
 * Only shown on customer-facing downloads — admin file-packages never include it.
 */
export function filingStatusBadgeHtml(filing: FilingForDoc): string {
  const rule = ruleFor(filing);
  if (filing.sunbizFilingNumber) {
    const date = filing.sunbizApprovedAt ?? filing.submittedAt;
    return `
      <div class="filing-stamp">
        <h4>FILED</h4>
        <div>${date ? formatDateLong(date) : ''}</div>
        <div>${escapeHtml(rule.shortName)} Dept. of State</div>
        <div>${escapeHtml(filing.sunbizFilingNumber)}</div>
      </div>
    `;
  }
  return `
    <div class="pending-badge">
      <strong>SUBMITTED</strong>
      <div>Awaiting ${escapeHtml(rule.name)} ${escapeHtml(rule.code === 'DE' ? 'Division of Corporations' : 'Secretary of State')} approval. The official filing number will appear here once issued.</div>
    </div>
  `;
}

/**
 * Renders the registered agent acceptance signature block. When the customer
 * picked LaunchForma as their Registered Agent, the agent (us) signs by an
 * internal authorized officer — the customer never types it. Otherwise we
 * print the externally-typed signature.
 */
/**
 * Render an Authorized Person / Officer table row. Handles both individual
 * owners (printed name + address) and business owners (legal entity name +
 * jurisdiction + optional signer). Keeping this in one helper means the
 * LLC and Corp generators stay consistent.
 */
/**
 * Collapse people who hold more than one role into a single row. In a small
 * corporation the same human is usually Director, President, Treasurer and
 * Secretary all at once — the wizard stores those as four ManagerMember rows.
 * For the executed documents we list each distinct person once and merge their
 * titles, so we never "generate another person" for a role the same individual
 * already fills. People are matched by name + address (case-insensitive).
 */
function dedupePeopleByIdentity(
  members: FilingForDoc['managersMembers'],
): FilingForDoc['managersMembers'] {
  const TITLE_ORDER = [
    'DIRECTOR',
    'PRESIDENT',
    'VICE_PRESIDENT',
    'VP',
    'TREASURER',
    'SECRETARY',
    'OFFICER',
  ];
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
  const grouped = new Map<
    string,
    { member: FilingForDoc['managersMembers'][number]; titles: string[] }
  >();
  for (const m of members) {
    const key = `${norm(m.businessLegalName) || norm(m.name)}|${[m.street1, m.city, m.state, m.zip]
      .map(norm)
      .join(',')}`;
    const existing = grouped.get(key);
    if (existing) {
      if (m.title && !existing.titles.includes(m.title)) existing.titles.push(m.title);
    } else {
      grouped.set(key, { member: m, titles: m.title ? [m.title] : [] });
    }
  }
  return [...grouped.values()].map(({ member, titles }) => ({
    ...member,
    title: titles
      .sort((a, b) => {
        const ai = TITLE_ORDER.indexOf(a);
        const bi = TITLE_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .join(', '),
  }));
}

function renderMemberRow(m: FilingForDoc['managersMembers'][number]): string {
  const isBusiness = m.ownerType === 'business' && !!m.businessLegalName;
  const nameCell = isBusiness
    ? `${escapeHtml(m.businessLegalName ?? m.name)}<br/><span class="legend">Entity owner — ${escapeHtml(m.businessJurisdiction ?? '—')}${
        m.signerName ? ` · by ${escapeHtml(m.signerName)}` : ''
      }</span>`
    : escapeHtml(m.name);
  const addressCell = escapeHtml(
    [m.street1, m.city, m.state, m.zip].filter(Boolean).join(', '),
  );
  return `<tr><td>${escapeHtml(m.title)}</td><td>${nameCell}</td><td>${addressCell}</td></tr>`;
}

function raAcceptanceBlock(
  ra: FilingForDoc['registeredAgent'],
  rule: FormationStateRule,
): string {
  if (!ra) return '';
  const date = ra.signedAt ? formatDateLong(new Date(ra.signedAt)) : 'Date of filing';
  if (ra.useOurService) {
    // Florida DOS: when the registered agent is an entity, a principal of that
    // entity must sign. Format requested for LaunchForma filings:
    // "Registered Agent Signature: Nelson Medina, LaunchForma LLC"
    const officer = rule.registeredAgent.signingOfficerName;
    const entity = rule.registeredAgent.name;
    const line = `${officer}, ${entity}`;
    return `
      <div class="signature-line">
        <span>
          <div class="ra-signature-label">Registered Agent Signature:</div>
          <span class="signature-name">${escapeHtml(line)}</span>
        </span>
        <span>Date: ${date}</span>
      </div>
    `;
  }
  return `
    <div class="signature-line">
      <span>
        <div class="ra-signature-label">Registered Agent Signature:</div>
        <span class="signature-name">${escapeHtml(ra.signature ?? ra.name)}</span>
      </span>
      <span>Date: ${date}</span>
    </div>
  `;
}

// ─── Articles of Organization / Certificate of Formation (LLC) ───────────

export function generateArticlesOfOrganization(filing: FilingForDoc): string {
  const rule = ruleFor(filing);
  const docTitle = formationDocumentLabel(rule, 'LLC');
  const ra = filing.registeredAgent;
  const principal = filing.principalAddress;
  const mailing =
    typeof filing.mailingAddress === 'string' || filing.mailingAddress == null
      ? principal
      : filing.mailingAddress;
  const opt = filing.optionalDetails;

  // Article IV — optional under s. 605.0201 / CR2E047, but banks and DFS
  // typically require managers / authorized representatives on the public record.
  // Heading follows current Florida DOS language ("Managers and Authorized
  // Representatives"), not the colloquial "Authorized Persons."
  const managementLegend =
    rule.code === 'FL'
      ? 'Title abbreviations — MGR: Manager · MGRM: Managing Member · AMBR: Authorized Member (management).'
      : 'Title abbreviations — MGR: Manager · MGRM: Managing Member · AMBR: Authorized Member · OFFICER: Officer.';
  const deWithholdsMembers = rule.code === 'DE' && opt?.includeMembersOnArticles !== true;
  const managementBlock = deWithholdsMembers
    ? `<p><em>Initial member information is intentionally omitted from this Certificate of Formation, as permitted under ${escapeHtml(rule.statuteReferences.llc)}. Member records are maintained at the Limited Liability Company's principal office.</em></p>`
    : filing.managersMembers.length > 0
      ? `<table>
          <tr><td class="label">Title</td><td class="label">Name</td><td class="label">Address</td></tr>
          ${filing.managersMembers.map((m) => renderMemberRow(m)).join('')}
        </table>
        <p class="legend">${escapeHtml(managementLegend)}</p>`
      : `<p><em>None designated at formation. Optional under ${escapeHtml(rule.statuteReferences.llc)}; financial institutions often require this information on the public record.</em></p>`;

  const otherProvisions = opt?.businessPurpose
    ? `<section class="article"><h3>Article VI — Additional Provisions</h3><p>${escapeHtml(opt.businessPurpose)}</p></section>`
    : '';

  const wyExtras =
    rule.code === 'WY'
      ? `
        <section class="article">
          <h3>Article VII — Organizer Email &amp; Electronic Service of Process</h3>
          <table>
            <tr><td class="label">Organizer Email</td><td>${escapeHtml(opt?.organizerEmail ?? '')}</td></tr>
            <tr><td class="label">Electronic Service Consent</td><td>${opt?.electronicServiceConsent ? 'YES — Organizer consents to electronic service of process by the Wyoming Secretary of State.' : 'NO — Organizer has not consented.'}</td></tr>
          </table>
        </section>
      `
      : '';

  const html = `
    <h1>${escapeHtml(docTitle)}</h1>
    <h2>State of ${escapeHtml(rule.name)} · Limited Liability Company</h2>
    <p class="preamble">The undersigned, acting as an authorized representative under ${escapeHtml(rule.statuteReferences.llc)}, hereby forms a limited liability company and submits this ${escapeHtml(docTitle)} for filing with the ${escapeHtml(rule.filingMailingAddress.label)}.</p>

    <section class="article">
      <h3>Article I — Name of Limited Liability Company</h3>
      <p>The name of the limited liability company is:</p>
      <p class="entity-name">${escapeHtml(filing.businessName)}</p>
    </section>

    <section class="article">
      <h3>Article II — Principal Office and Mailing Address</h3>
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
    </section>

    <section class="article">
      <h3>Article III — Registered Agent and Registered Office</h3>
      <p>The limited liability company cannot serve as its own registered agent. The name and ${escapeHtml(rule.name)} street address of the initial registered agent are:</p>
      <table>
        <tr><td class="label">Registered Agent</td><td>${escapeHtml(ra?.name ?? '')}</td></tr>
        <tr><td class="label">Registered Office</td><td>${addressLines(ra)}</td></tr>
      </table>
      <p class="acceptance">Having been named as registered agent and to accept service of process for the above-stated limited liability company at the place designated in this certificate, I hereby accept the appointment as registered agent and agree to act in this capacity. I further agree to comply with the provisions of all statutes relating to the proper and complete performance of my duties, and I am familiar with and accept the obligations of my position as registered agent as provided for in ${escapeHtml(rule.statuteReferences.llc)}.</p>
      ${raAcceptanceBlock(ra, rule)}
    </section>

    <section class="article">
      <h3>Article IV — Managers and Authorized Representatives</h3>
      <p>The name and address of each person authorized to manage and control the Limited Liability Company:</p>
      ${managementBlock}
    </section>

    <section class="article">
      <h3>Article V — Effective Date</h3>
      <p>${
        opt?.effectiveDate
          ? formatDateLong(new Date(opt.effectiveDate))
          : 'Effective upon filing by the Department of State.'
      }</p>
    </section>

    ${otherProvisions}
    ${wyExtras}

    <div class="signature-block">
      <p><strong>Required signature.</strong> Signature of a member or an authorized representative of a member, pursuant to ${escapeHtml(rule.statuteReferences.llc)}:</p>
      <div class="signature-line">
        <span>
          <span class="signature-name">${escapeHtml(filing.incorporatorSignature ?? '')}</span>
          <div class="ra-signature-label">Typed / electronic signature</div>
        </span>
        <span>Date: ${filing.incorporatorSignedAt ? formatDateLong(filing.incorporatorSignedAt) : 'Date of filing'}</span>
      </div>
      <p class="legend">I am aware that any false information submitted in a document to the Department of State constitutes a criminal offense under ${escapeHtml(rule.name)} law.</p>
    </div>

    <p class="footer-note">${escapeHtml(docTitle)} · ${escapeHtml(rule.statuteReferences.llc)} · ${escapeHtml(rule.filingMailingAddress.label)}</p>
  `;
  return docShell(docTitle, html);
}

// ─── Articles of Incorporation / Certificate of Incorporation (Corp) ─────

export function generateArticlesOfIncorporation(filing: FilingForDoc): string {
  const rule = ruleFor(filing);
  const docTitle = formationDocumentLabel(rule, 'CORP');
  const ra = filing.registeredAgent;
  const principal = filing.principalAddress;
  const mailing =
    typeof filing.mailingAddress === 'string' || filing.mailingAddress == null
      ? principal
      : filing.mailingAddress;
  const opt = filing.optionalDetails;

  // Article V — Initial officers/directors. Optional under most state
  // statutes; we render whatever the customer entered as initial
  // directors/officers, collapsing one person holding several titles into a
  // single row (Director/President/Treasurer/Secretary is usually one human).
  const dedupedOfficers = dedupePeopleByIdentity(filing.managersMembers);
  const officers = dedupedOfficers.map((m) => renderMemberRow(m)).join('');

  const officersBlock =
    dedupedOfficers.length > 0
      ? `<table>
          <tr><td class="label">Title</td><td class="label">Name</td><td class="label">Address</td></tr>
          ${officers}
        </table>
        <p class="legend">Title key — P: President · VP: Vice President · S: Secretary · T: Treasurer · D: Director.</p>`
      : `<p><em>None listed at filing. (Optional under ${escapeHtml(rule.statuteReferences.corp)}.)</em></p>`;

  const purpose = opt?.businessPurpose
    ? escapeHtml(opt.businessPurpose)
    : `The general purpose for which this corporation is organized is to engage in any lawful act or activity for which corporations may be organized under ${escapeHtml(rule.statuteReferences.corp)}.`;

  // Capital stock — Delaware requires both authorized share count AND par
  // value (or explicit "no par value"). Other states only require the count.
  const authorizedShares = opt?.authorizedShares ?? (rule.code === 'DE' ? 1500 : 1000);
  const parValueClause =
    rule.code === 'DE'
      ? opt?.parValueCents === 0
        ? ' Each share has <strong>no par value</strong>.'
        : opt?.parValueCents != null
          ? ` Each share has a par value of <strong>${formatCurrency(opt.parValueCents)}</strong>.`
          : ' Each share has <strong>no par value</strong>.'
      : '';

  const html = `
    <h1>${escapeHtml(docTitle)}</h1>
    <h2>State of ${escapeHtml(rule.name)} · ${rule.code === 'DE' ? 'Stock Corporation' : 'Profit Corporation'}</h2>
    <p class="preamble">The undersigned, acting as incorporator under ${escapeHtml(rule.statuteReferences.corp)}, hereby forms a corporation and submits this ${escapeHtml(docTitle)} for filing with the ${escapeHtml(rule.filingMailingAddress.label)}.</p>

    <section class="article">
      <h3>Article I — Corporate Name</h3>
      <p class="entity-name">${escapeHtml(filing.businessName)}</p>
    </section>

    <section class="article">
      <h3>Article II — Principal Office and Mailing Address</h3>
      <table>
        <tr><td class="label">Principal Office</td><td>${addressLines(principal)}</td></tr>
        <tr><td class="label">Mailing Address</td><td>${addressLines(mailing)}</td></tr>
      </table>
    </section>

    <section class="article">
      <h3>Article III — Purpose</h3>
      <p>${purpose}</p>
    </section>

    <section class="article">
      <h3>Article IV — Authorized Shares</h3>
      <p>The corporation is authorized to issue <strong>${authorizedShares}</strong> shares of common stock, all of one class.${parValueClause}</p>
    </section>

    <section class="article">
      <h3>Article V — Initial Officers and Directors</h3>
      ${officersBlock}
    </section>

    <section class="article">
      <h3>Article VI — Registered Agent and Registered Office</h3>
      <p>The corporation cannot serve as its own registered agent. The name and ${escapeHtml(rule.name)} street address of the initial registered agent are:</p>
      <table>
        <tr><td class="label">Registered Agent</td><td>${escapeHtml(ra?.name ?? '')}</td></tr>
        <tr><td class="label">Registered Office</td><td>${addressLines(ra)}</td></tr>
      </table>
      <p class="acceptance">Having been named as registered agent and to accept service of process for the above-stated corporation at the place designated in this certificate, I hereby accept the appointment as registered agent and agree to act in this capacity. I further agree to comply with the provisions of all statutes relating to the proper and complete performance of my duties, and I am familiar with and accept the obligations of my position as registered agent as provided for in ${escapeHtml(rule.statuteReferences.corp)}.</p>
      ${raAcceptanceBlock(ra, rule)}
    </section>

    <section class="article">
      <h3>Article VII — Effective Date</h3>
      <p>${
        opt?.effectiveDate
          ? formatDateLong(new Date(opt.effectiveDate))
          : 'Effective upon filing by the Department of State.'
      }</p>
    </section>

    <section class="article">
      <h3>Article VIII — Incorporator</h3>
      <p>The name and address of the incorporator is: <strong>${escapeHtml(filing.incorporatorSignature ?? '')}</strong>${principal ? `, ${escapeHtml([principal.street1, principal.city, principal.state, principal.zip].filter(Boolean).join(', '))}` : ''}.</p>
    </section>

    <div class="signature-block">
      <p><strong>Required signature — Incorporator:</strong></p>
      <div class="signature-line">
        <span>
          <span class="signature-name">${escapeHtml(filing.incorporatorSignature ?? '')}</span>
          <div class="ra-signature-label">Typed / electronic signature</div>
        </span>
        <span>Date: ${filing.incorporatorSignedAt ? formatDateLong(filing.incorporatorSignedAt) : 'Date of filing'}</span>
      </div>
      <p class="legend">I am aware that any false information submitted in a document to the Department of State constitutes a criminal offense under ${escapeHtml(rule.name)} law.</p>
    </div>

    <p class="footer-note">${escapeHtml(docTitle)} · ${escapeHtml(rule.statuteReferences.corp)} · ${escapeHtml(rule.filingMailingAddress.label)}</p>
  `;
  return docShell(docTitle, html);
}

// ─── Operating Agreement (single- or multi-member) ────────────────────────

export function generateOperatingAgreement(filing: FilingForDoc): string {
  const rule = ruleFor(filing);
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

    <p>This Operating Agreement (this "Agreement") of <strong>${escapeHtml(filing.businessName)}</strong> (the "Company"), a ${escapeHtml(rule.name)} limited liability company, is entered into as of ${today}, by and among the Company and the Member(s) listed below.</p>

    <h3>1. Formation</h3>
    <p>The Company was organized as a ${escapeHtml(rule.name)} limited liability company on ${filing.submittedAt ? formatDateLong(filing.submittedAt) : 'the date of filing'} by the filing of ${escapeHtml(rule.documentLabels.llcArticles)} with the ${escapeHtml(rule.filingMailingAddress.label)} pursuant to ${escapeHtml(rule.statuteReferences.llc)}.</p>

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
    <p>No Member shall be personally liable for any debt, obligation, or liability of the Company solely by reason of being a Member, except as required by ${escapeHtml(rule.name)} law.</p>

    <h3>8. Dissolution</h3>
    <p>The Company shall be dissolved upon ${isMulti ? 'the written consent of Members holding more than fifty percent (50%) of the ownership interests' : 'the written election of the sole Member'} or by operation of law.</p>

    <h3>9. Governing Law</h3>
    <p>This Agreement shall be governed by the laws of the State of ${escapeHtml(rule.name)}.</p>

    <div class="signature-block">
      <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>
      ${filing.managersMembers
        .map(
          (m) =>
            `<div class="signature-line"><span><span class="signature-name">${escapeHtml(m.name)}</span><br/>${escapeHtml(m.name)}, Member</span><span>Date: ${today}</span></div>`,
        )
        .join('')}
    </div>

    <p class="footer-note">DISCLAIMER: This Operating Agreement is provided as a convenience based on information you supplied. LaunchForma is not a law firm and does not provide legal advice. We recommend reviewing this document with an attorney before relying on it for material business decisions.</p>
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
  /**
   * Optional processing-speed selection. When the customer chose an
   * expedited tier, we add a dedicated line to the cover letter so the
   * remitting clerk applies the right service code at the state.
   */
  processingOption?: { label: string; estimate: string; feeCents: number } | null;
}): string {
  const rule = ruleFor(args.filing);
  const docTitle = formationDocumentLabel(rule, args.filing.entityType);
  const subjectLine = `${docTitle} — ${args.filing.businessName}`;
  const baseFee = stateFilingFeeCents(rule, args.filing.entityType);
  const certStatusFee = certificateOfStatusFeeCents(rule, args.filing.entityType);
  const certCopyFee = certifiedCopyFeeCents(rule, args.filing.entityType);

  // Cover letter has a four-checkbox grid: base fee · base + status ·
  // base + copy · base + status + copy. We render it with the matching one
  // checked based on the customer's add-on selections.
  const checked = (on: boolean) => (on ? '☑' : '☐');
  const wantsBoth = args.certificateOfStatus && args.certifiedCopy;
  const wantsStatus = args.certificateOfStatus && !args.certifiedCopy;
  const wantsCopy = args.certifiedCopy && !args.certificateOfStatus;
  const wantsBase = !args.certificateOfStatus && !args.certifiedCopy;

  const mailingAddressLines = rule.filingMailingAddress.lines
    .map((l) => escapeHtml(l))
    .join('<br/>');

  const html = `
    <h1>${escapeHtml(rule.documentLabels.coverLetter)}</h1>
    <h2>${escapeHtml(subjectLine)}</h2>

    <p><strong>TO:</strong> ${escapeHtml(rule.filingMailingAddress.label)}</p>
    <p><strong>SUBJECT:</strong> ${escapeHtml(args.filing.businessName)}</p>

    <p>The enclosed ${escapeHtml(docTitle)} and fee(s) are submitted for filing.</p>

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

    ${
      args.processingOption && args.processingOption.feeCents > 0
        ? `<p><strong>Processing service requested:</strong> ${escapeHtml(args.processingOption.label)} — ${escapeHtml(args.processingOption.estimate)} · expedite fee ${formatCurrency(args.processingOption.feeCents, { showZero: true })} included in remittance.</p>`
        : ''
    }

    <p style="margin-top:24px;"><strong>Total submitted with this cover letter:</strong> ${formatCurrency(args.totalFeeCents, { showZero: true })}</p>

    <p style="margin-top:32px;">
      <strong>Mailing Address</strong><br/>
      ${mailingAddressLines}
    </p>

    <p class="footer-note">INTERNAL — LaunchForma. This cover letter accompanies the ${escapeHtml(docTitle)} to the ${escapeHtml(rule.filingMailingAddress.label)} and is not part of the customer's deliverable set.</p>
  `;
  return docShell(rule.documentLabels.coverLetter, html);
}

// ─── Receipt ──────────────────────────────────────────────────────────────

export function generateReceipt(args: {
  filingId: string;
  businessName: string;
  totalCents: number;
  lines: { label: string; cents: number }[];
  paidAt: Date;
  cardLast4?: string;
  /** Defaults to FL when not provided so legacy callers stay valid. */
  state?: StateCode;
}): string {
  const rule = FORMATION_STATES[args.state ?? 'FL'] ?? FORMATION_STATES.FL;
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
      Filing package pricing includes the required ${escapeHtml(rule.name)} filing
      fee and LaunchForma preparation and submission. LaunchForma remits the
      state filing fee to ${escapeHtml(rule.name)} on your behalf.
    </p>

    <p class="footer-note">LaunchForma · support@launchforma.com</p>
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

// ─── IRS Form 2553 — S-Corporation election (prepared mail-in form) ───────

export interface Form2553Owner {
  name: string;
  address?: string;
  /** "500 shares" (corp) or "50%" (LLC). */
  ownership?: string;
  taxIdType?: string | null; // SSN | ITIN | EIN
  /** Last 4 only — full Tax IDs are never embedded in the stored document. */
  taxIdLast4?: string | null;
  taxYearEnd?: string | null;
  consent?: boolean | null;
}

export interface Form2553Args {
  businessName: string;
  entityType: 'LLC' | 'CORP';
  state?: string | null;
  /** Election effective date (defaults to formation date guidance). */
  effectiveDate?: string | null;
  feiNumber?: string | null;
  owners: Form2553Owner[];
}

/**
 * Renders a prepared IRS Form 2553 (Election by a Small Business Corporation).
 *
 * This is a customer-facing PREPARED form + filing instructions, not a fake
 * IRS submission. We deliberately mask Tax IDs (last 4 only) so full SSNs are
 * never persisted in the document blob (OWASP A02/A04). The taxpayer signs and
 * mails/faxes the completed form to the IRS; we pre-fill everything we can and
 * surface the consents collected in the wizard.
 */
export function generateForm2553(args: Form2553Args): string {
  const rule = getFormationState(args.state ?? 'FL');
  const entityLabel =
    args.entityType === 'LLC'
      ? 'Limited Liability Company (electing S-Corporation taxation)'
      : 'Corporation (electing S-Corporation taxation)';
  const ownerLabel = args.entityType === 'LLC' ? 'Member' : 'Shareholder';
  const maskTaxId = (o: Form2553Owner) =>
    o.taxIdLast4
      ? `${o.taxIdType === 'EIN' ? '••-•••' : '•••-••'}-${escapeHtml(o.taxIdLast4)}`
      : '—';

  const rows = args.owners
    .map(
      (o) => `<tr>
        <td>${escapeHtml(o.name)}${o.address ? `<br/><span class="legend">${escapeHtml(o.address)}</span>` : ''}</td>
        <td>${escapeHtml(o.ownership ?? '—')}</td>
        <td>${escapeHtml(o.taxIdType ?? 'SSN')} ${maskTaxId(o)}</td>
        <td>${escapeHtml(o.taxYearEnd ?? '12/31')}</td>
        <td style="text-align:center">${o.consent ? '✓' : '—'}</td>
      </tr>`,
    )
    .join('');

  const body = `
    <div class="pending-badge">
      <strong>PREPARED — NOT YET FILED</strong>
      <div>Sign and submit to the IRS per the instructions below. LaunchForma prepares this form; the election is made when the IRS receives it.</div>
    </div>
    <h1>Form 2553</h1>
    <h2>Election by a Small Business Corporation (S-Corporation)</h2>

    <h3>Part I — Election Information</h3>
    <table>
      <tr><td class="label">Name</td><td>${escapeHtml(args.businessName)}</td></tr>
      <tr><td class="label">Entity</td><td>${escapeHtml(entityLabel)}</td></tr>
      <tr><td class="label">State / date of formation</td><td>${escapeHtml(rule.name)}${
        args.effectiveDate ? ` · ${escapeHtml(args.effectiveDate)}` : ''
      }</td></tr>
      <tr><td class="label">Employer ID (EIN)</td><td>${escapeHtml(args.feiNumber ?? 'Apply for / enter your EIN before filing')}</td></tr>
      <tr><td class="label">Election effective date</td><td>${escapeHtml(args.effectiveDate ?? 'Beginning of the current tax year')}</td></tr>
      <tr><td class="label">Selected tax year</td><td>Calendar year ending December 31 (unless noted per owner below)</td></tr>
    </table>

    <h3>Part I — ${ownerLabel} Consent Statement</h3>
    <p class="legend">Each ${ownerLabel.toLowerCase()} consents to the S-Corporation election. Tax IDs are masked here for security; enter the full number on the signed copy before mailing.</p>
    <table>
      <tr>
        <td class="label">${ownerLabel}</td>
        <td class="label">Ownership</td>
        <td class="label">Tax ID</td>
        <td class="label">Tax year end</td>
        <td class="label">Consent</td>
      </tr>
      ${rows || `<tr><td colspan="5">No ${ownerLabel.toLowerCase()} information on file.</td></tr>`}
    </table>

    <h3>How to file (important)</h3>
    <p>
      1. Verify the entity name, EIN, and each owner's full Tax ID on the signed copy.<br/>
      2. An officer/owner must sign and date the form.<br/>
      3. <strong>Deadline:</strong> file no later than 2 months and 15 days after the beginning of the tax year the election takes effect (or any time in the preceding tax year).<br/>
      4. Mail or fax to the IRS service center for ${escapeHtml(rule.name)} (see the current Form 2553 instructions at irs.gov for the address/fax number, which the IRS updates periodically).
    </p>

    <div class="footer-note">
      LaunchForma is not a law firm or accounting firm and does not provide tax advice. This prepared form reflects the information you entered. Confirm eligibility (≤100 eligible shareholders, one class of stock, eligible owners) with a CPA before filing.
    </div>
  `;
  return docShell('IRS Form 2553 — S-Corporation Election', body);
}

export function encodeDocument(html: string): string {
  return Buffer.from(html, 'utf-8').toString('base64');
}

export function decodeDocument(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}
