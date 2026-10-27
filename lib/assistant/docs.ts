import 'server-only';

/**
 * Editable company-facts knowledge for the assistant. Keep this short, factual,
 * and only things we can stand behind. Expand it as new objections show up in
 * the chat logs - this is the cheapest lever to improve containment.
 *
 * Do NOT put pricing numbers here (the getPricing tool is the source of truth)
 * or legal/tax advice.
 */
export const COMPANY_FACTS = `
About LaunchForma
- LaunchForma is an online business-formation service. We prepare and file LLC and
  Corporation formation paperwork with the state, and offer add-ons like operating
  agreements, S-Corp election, managed annual reports, and Registered Agent.
- We currently form Florida companies only. Do not offer formation, checkout,
  or a registered agent in any other state.
- We are NOT a law firm and do not give legal or tax advice. For legal/tax specifics,
  recommend a licensed professional and offer to connect them with our team.

What's included
- Every package includes the state filing fee, preparation + submission within
  1 business day, Year-1 Registered Agent, and digital delivery of filed documents.
- Registered Agent renews at $150/year after year one; cancel anytime.
- 14-day satisfaction guarantee (see /refund-policy).

Key concepts (explain in one plain-language sentence when asked)
- Registered Agent: a person/company with a physical in-state address that receives
  legal mail for your business. Required by law. We can be yours, free year one.
- Federal tax ID: not part of our formation packages. If asked, say the IRS issues it
  for free at irs.gov; do not offer to file it.
- BOI report: companies formed in the U.S. are exempt from FinCEN beneficial-ownership
  reporting (August 2026 final rule), so there is nothing to file. We do not sell it.
- Operating Agreement (LLC) / Bylaws (Corp): the internal rulebook for the company;
  banks often ask for it.
- S-Corp: a tax election (IRS Form 2553), not a separate entity - an LLC or Corp can
  elect it to potentially save on self-employment tax.

Support + handoff
- Support email: help@launchforma.com.
- If you cannot answer, or the user wants a human, use the escalateToHuman tool.

Useful pages
- Pricing: /pricing · FAQ: /faq · Services: /services · BOI: /boi-reporting
- Guides: /guides (how to form a Florida LLC, Florida annual report, Florida registered agent, operating agreement). BOI update: /boi-reporting (/guides/boi-filing-2026 redirects there).
- Start a filing: /start
`.trim();
