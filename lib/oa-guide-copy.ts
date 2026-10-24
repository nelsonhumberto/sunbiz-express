/**
 * English copy for /guides/florida-llc-operating-agreement.
 * Spanish copy lives in messages/es.json (guideOa) so the page can use
 * getTranslations. FAQ strings are the visible text and the FAQPage JSON-LD.
 */

export const OA_GUIDE_PATH = '/guides/florida-llc-operating-agreement';
export const OA_GUIDE_PUBLISHED = '2026-05-27';
/** Rewrite date. Article dateModified and sitemap lastmod use this day. */
export const OA_GUIDE_MODIFIED = '2026-10-24';
export const OA_SITEMAP_LASTMOD = '2026-10-24T00:00:00.000Z';

/** Popular package. Matches the pricing card query (?tier=STANDARD). */
export const POPULAR_START_HREF = '/start?tier=STANDARD';

export const OA_META_TITLE_EN = 'Florida LLC Operating Agreement: Free Sample & Guide';
export const OA_META_TITLE_NEUTRAL_EN = 'Florida LLC Operating Agreement Guide';
export const OA_META_DESCRIPTION_EN =
  'What a Florida LLC operating agreement is, what Chapter 605 says, single vs multi-member, and how to adopt one. Download a free sample template.';
export const OA_META_DESCRIPTION_NEUTRAL_EN =
  'What a Florida LLC operating agreement is, what Chapter 605 says, single vs multi-member, and how to adopt one.';

export const ANNUAL_REPORT_TITLE = 'File Your Florida Annual Report Online | Due May 1';
export const ANNUAL_REPORT_DESCRIPTION =
  'File your Florida LLC or corporation annual report between Jan 1 and May 1. See the state fee, the $400 late fee, and how LaunchForma files it for you.';

export interface OaFaqItem {
  q: string;
  a: string;
}

export interface OaDownloadCopy {
  heading: string;
  subhead: string;
  emailLabel: string;
  consentBefore: string;
  privacyLabel: string;
  privacyHref: string;
  /** Plain sentence stored with the lead. Matches the checkbox the person sees. */
  consentText: string;
  button: string;
  success: string;
  note: string;
  /** Shown in place of the form while oa_template_download is off. */
  comingSoon: string;
  /** Not-legal-advice line, same claim as the header inside the sample files. */
  sampleHeader: string;
  invalidEmail: string;
  consentRequired: string;
  genericError: string;
}

export interface OaGuideCopy {
  /** Title and description used when the sample download is on. */
  metaTitle: string;
  metaDescription: string;
  /** Title and description used when OA_TEMPLATE_DOWNLOAD_ENABLED is off. */
  metaTitleNeutral: string;
  metaDescriptionNeutral: string;
  h1: string;
  /** Intro without the download sentence. */
  lead: string;
  /** Appended to the lead only when the template download is enabled. */
  downloadLead: string;
  body: string;
  related: string;
  ctaHeading: string;
  ctaBody: string;
  ctaStart: string;
  ctaPricing: string;
  disclaimer: string;
  faqHeading: string;
  faq: OaFaqItem[];
  download: OaDownloadCopy;
}

export const OA_FAQ_EN: OaFaqItem[] = [
  {
    q: 'Is an operating agreement required in Florida?',
    a: 'Florida does not require you to file one with the state. Under section 605.0102(45), an operating agreement may be oral, implied, in a record, or a combination. If the agreement does not cover a matter, Chapter 605 governs it (s. 605.0105(2)).',
  },
  {
    q: 'Do I file my operating agreement with Sunbiz?',
    a: 'No. The Florida Division of Corporations states that "the operating agreement is not filed with the Division of Corporations." Keep the signed copy with your company records.',
  },
  {
    q: 'Does a single-member LLC need an operating agreement?',
    a: 'Florida does not require a written one, but a one-member agreement is valid under section 605.0106(5). Many owners adopt one to document ownership and signing authority, and banks often ask for it.',
  },
  {
    q: 'What is the difference between member-managed and manager-managed?',
    a: 'In a member-managed LLC, management is vested in the members. In a manager-managed LLC, the managers decide company matters. A Florida LLC is member-managed unless the operating agreement or the articles say otherwise (s. 605.0407).',
  },
  {
    q: 'Can I write my own operating agreement?',
    a: 'Chapter 605 does not say it must be prepared by an attorney. Because it is a binding agreement, consider having an attorney review it, especially with several members or outside investors.',
  },
  {
    q: 'Can I change my operating agreement later?',
    a: 'Yes. The operating agreement governs "the means and conditions for amending the operating agreement" (s. 605.0105(1)(d)). Follow the amendment section in your agreement and keep the signed amendment with your records.',
  },
  {
    q: 'Is the operating agreement public?',
    a: 'It is not filed with the Division of Corporations, so it is not part of the public filings on Sunbiz. Your Articles of Organization and annual reports are public.',
  },
];

export const OA_CONSENT_EN =
  'I agree to receive the template and occasional emails from LaunchForma. I can unsubscribe at any time. See our Privacy Policy.';
export const OA_CONSENT_ES =
  'Acepto recibir la plantilla y correos ocasionales de LaunchForma. Puedo darme de baja cuando quiera. Consulta nuestra Política de privacidad.';

export const OA_GUIDE_EN: OaGuideCopy = {
  metaTitle: OA_META_TITLE_EN,
  metaDescription: OA_META_DESCRIPTION_EN,
  metaTitleNeutral: OA_META_TITLE_NEUTRAL_EN,
  metaDescriptionNeutral: OA_META_DESCRIPTION_NEUTRAL_EN,
  h1: 'Florida LLC Operating Agreement: What It Is and How to Adopt One',
  lead: 'An operating agreement is the internal rulebook of your LLC. Florida does not ask you to file it with the state, but the law gives it real weight, and banks often ask to see it. This guide explains what it is, what Florida law says about it, and how to put one in place.',
  downloadLead: 'You can also download a free sample template below.',
  ctaHeading: 'Want an operating agreement prepared with your LLC?',
  ctaBody:
    'LaunchForma\'s Popular package ($279 all-in, Florida state fees included) lists an "Operating Agreement (custom)" along with a Certificate of Status and a Certified Copy of Articles. Our 24/7 AI assistant guides your order, and our team files with the State of Florida.',
  ctaStart: 'Start your Florida LLC',
  ctaPricing: 'See what each package includes',
  disclaimer:
    'This page and template are general information, not legal advice. LaunchForma is not a law firm. Consider having an attorney review your agreement.',
  faqHeading: 'FAQ',
  faq: OA_FAQ_EN,
  download: {
    heading: 'Get the free Florida LLC operating agreement sample',
    subhead:
      'Single-member and multi-member versions, in PDF and Word. Plain language, with [brackets] for your details.',
    emailLabel: 'Email address',
    consentBefore:
      'I agree to receive the template and occasional emails from LaunchForma. I can unsubscribe at any time. See our',
    privacyLabel: 'Privacy Policy',
    privacyHref: '/privacy',
    consentText: OA_CONSENT_EN,
    button: 'Send me the template',
    success: "Check your inbox. Confirm your email and we'll send your download links.",
    note: 'The sample is general information, not legal advice. Have an attorney review it before you use it.',
    comingSoon: 'Free sample template coming soon.',
    sampleHeader:
      'SAMPLE for general information only, not legal advice; have an attorney review before use.',
    invalidEmail: 'Enter a valid email address.',
    consentRequired: 'Check the box to agree before we send the template.',
    genericError: 'We could not send that. Try again in a few minutes.',
  },
  body: `## What is an LLC operating agreement?

An operating agreement is an agreement among the members (owners) of an LLC about how the company works: who owns what, who makes decisions, how money is distributed, how members join or leave, and how the agreement itself can be changed.

Florida law defines it broadly. Section 605.0102(45), Florida Statutes, says:

> "Operating agreement" means an agreement, whether referred to as an operating agreement or not, which may be oral, implied, in a record, or in any combination thereof, of the members of a limited liability company, including a sole member, concerning the matters described in s. 605.0105(1).

Section 605.0105(1) lists what the operating agreement governs, including:

> (a) Relations among the members as members and between the members and the limited liability company.

> (b) The rights and duties under this chapter of a person in the capacity of manager.

> (c) The activities and affairs of the company and the conduct of those activities and affairs.

> (d) The means and conditions for amending the operating agreement.

## Does Florida require an operating agreement?

Florida does not require you to file an operating agreement with the state, and Chapter 605 does not require it to be written. As quoted above, it "may be oral, implied, in a record, or in any combination thereof."

What happens if your agreement does not cover something? Section 605.0105(2) answers that:

> To the extent the operating agreement does not otherwise provide for a matter described in subsection (1), this chapter governs the matter.

In other words, Chapter 605's default rules fill any gaps. A written agreement lets the members document their own choices instead of relying only on those defaults. Note that some rules cannot be changed by agreement. Section 605.0105(3) lists them, for example matters about registered agents and filings with the Department of State.

Florida also expects the LLC to keep a copy. Under section 605.0410(1)(b), an LLC keeps at its principal office:

> A copy of the then-effective operating agreement, if made in a record, and all amendments thereto if made in a record.

## Why banks often ask for one

When you open a business bank account, banks generally want to confirm who owns the LLC and who is allowed to act for it. The Articles of Organization filed with the state may not show all of that, so many banks ask for the operating agreement or a similar document. Requirements vary by bank, so ask your bank what it needs before your appointment.

## Single-member vs multi-member

**Single-member LLC.** One owner. Florida law treats a one-member agreement as valid. Section 605.0106(5) says:

> An operating agreement of a limited liability company that has only one member is not unenforceable simply because there is only one person who is a party to the operating agreement.

A single-member agreement is usually shorter. It typically records ownership, who can sign for the company, and what happens to the interest if the owner dies or becomes unable to act.

**Multi-member LLC.** Two or more owners. The agreement usually covers more: each member's contribution and percentage, how profits and losses are allocated, voting, what needs unanimous approval, transfers of interests, buyouts, and how disagreements are handled.

## Member-managed vs manager-managed

Under section 605.0407(1), a Florida LLC is member-managed unless the operating agreement or the articles of organization expressly provide that it is manager-managed (or use words of similar import).

- **Member-managed:** "the management and conduct of the company are vested in the members" (s. 605.0407(2)).
- **Manager-managed:** company matters are "decided exclusively by the manager, or if there is more than one manager, by the managers, except as expressly provided in this chapter" (s. 605.0407(3)).

Your operating agreement and your Articles of Organization should say the same thing about management.

## Common sections of an operating agreement

1. Name, formation date, principal office, and registered agent
2. Purpose of the company
3. Members, contributions, and ownership percentages
4. Management (member-managed or manager-managed) and authority to sign, including bank accounts
5. Allocations of profits and losses, and distributions
6. Meetings, voting, and actions that need unanimous consent
7. Transfers of interests and admission of new members
8. Death, incapacity, or withdrawal of a member
9. Records and accounting
10. Dissolution and winding up
11. Amendments
12. Governing law (Florida) and signatures

Tax classification choices (for example an S corporation election) are a topic for your CPA or tax advisor. This guide does not give tax advice.

## How to adopt your operating agreement

1. **Draft it.** Start from a template or have an attorney prepare it.
2. **Check it against your Articles.** Names, management type, and principal office should match what you filed.
3. **Sign it.** Every member signs (and any manager, if your agreement calls for it). Florida also allows an agreement to be made before formation: section 605.0106(3) lets the initial members agree that it "will become the operating agreement" upon formation.
4. **Keep it with your records.** Store the signed copy with your company records (s. 605.0410). You do not file it with Sunbiz. The Florida Division of Corporations says: "The operating agreement is not filed with the Division of Corporations."
5. **Update it.** When members, percentages, or management change, amend it in writing following the amendment section.`,
  related: `## Related guides

- [How to form an LLC in Florida](/guides/how-to-form-an-llc-in-florida)
- [Florida annual report: deadline, fees, and how to file](/guides/florida-annual-report)
- [Florida registered agent guide](/guides/florida-registered-agent)
- [Start your Florida LLC](${POPULAR_START_HREF})

## Official sources

- Florida Statutes s. 605.0102 (definitions): https://www.flsenate.gov/Laws/Statutes/2025/605.0102
- Florida Statutes s. 605.0105 (operating agreement; scope, function, and limitations): https://www.flsenate.gov/Laws/Statutes/2025/605.0105
- Florida Statutes s. 605.0106 (effect of operating agreement; preformation agreement): https://www.flsenate.gov/Laws/Statutes/2025/605.0106
- Florida Statutes s. 605.0407 (management of LLC): https://www.flsenate.gov/Laws/Statutes/2025/605.0407
- Florida Statutes s. 605.0410 (records to be kept): https://www.flsenate.gov/Laws/Statutes/2025/605.0410
- Florida Division of Corporations, LLC management information: https://efile.sunbiz.org/llc_mgrm_mgr.html
- Florida Statutes Chapter 605 (Online Sunshine): http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605.html`,
};

export function oaGuideMeta(
  copy: OaGuideCopy,
  downloadEnabled: boolean,
): { title: string; description: string } {
  if (downloadEnabled) {
    return { title: copy.metaTitle, description: copy.metaDescription };
  }
  return { title: copy.metaTitleNeutral, description: copy.metaDescriptionNeutral };
}

/** The download sentence is part of the intro only while the sample is on. */
export function oaGuideLead(copy: OaGuideCopy, downloadEnabled: boolean): string {
  if (!downloadEnabled) return copy.lead;
  const extra = copy.downloadLead.trim();
  return extra ? `${copy.lead} ${extra}` : copy.lead;
}
