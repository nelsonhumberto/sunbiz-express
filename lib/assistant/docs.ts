import 'server-only';

/**
 * Editable company-facts knowledge for the assistant. Keep this short, factual,
 * and only things we can stand behind. Expand it as new objections show up in
 * the chat logs — this is the cheapest lever to improve containment.
 *
 * Do NOT put pricing numbers here (the getPricing tool is the source of truth)
 * or legal/tax advice.
 */
export const COMPANY_FACTS = `
About LaunchForma
- LaunchForma is an online business-formation service. We prepare and file LLC and
  Corporation formation paperwork with the state, and offer add-ons like EIN, BOI
  (FinCEN beneficial-ownership) filing, operating agreements, and Registered Agent.
- States we file in today: Florida, Wyoming, Delaware. Other states are "coming soon"
  (waitlist only) — do not promise filing for them.
- We are NOT a law firm and do not give legal or tax advice. For legal/tax specifics,
  recommend a licensed professional and offer to connect them with our team.

What's included
- Every package includes the state filing fee, preparation + same-business-day
  submission, Year-1 Registered Agent, and digital delivery of filed documents.
- Registered Agent renews at $119/year after year one; cancel anytime.
- 14-day satisfaction guarantee (see /refund-policy).

Key concepts (explain in one plain-language sentence when asked)
- Registered Agent: a person/company with a physical in-state address that receives
  legal mail for your business. Required by law. We can be yours, free year one.
- EIN: your business's federal tax ID from the IRS — needed for a bank account,
  employees, and taxes.
- BOI report: a FinCEN filing under the Corporate Transparency Act naming who owns
  the company. Most new entities must file within 30 days of formation. We offer a
  managed BOI filing.
- Operating Agreement (LLC) / Bylaws (Corp): the internal rulebook for the company;
  banks often ask for it.
- S-Corp: a tax election (IRS Form 2553), not a separate entity — an LLC or Corp can
  elect it to potentially save on self-employment tax.

Support + handoff
- Support email: help@launchforma.com.
- If you cannot answer, or the user wants a human, use the escalateToHuman tool.

Useful pages
- Pricing: /pricing · FAQ: /faq · Services: /services · BOI: /boi-reporting
- Guides: /guides (operating agreement, Wyoming vs Delaware, BOI 2026)
- Start a filing: /start
`.trim();
