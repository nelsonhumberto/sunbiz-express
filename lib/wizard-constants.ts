// Constants used by the wizard. Kept separate from actions/wizard.ts because
// "use server" files can only export async functions.

export const TOTAL_STEPS = 12;

export const STEP_NAMES: Record<number, { slug: string; title: string; subtitle: string }> = {
  1: {
    slug: 'entity',
    title: 'What kind of business?',
    subtitle: "We'll handle the paperwork — you choose the structure.",
  },
  2: {
    slug: 'name',
    title: "What's your business name?",
    subtitle: "We'll check the Florida Sunbiz database in real time.",
  },
  3: {
    slug: 'tier',
    title: 'How much do you want us to do?',
    subtitle: 'Pick the tier that matches your stage.',
  },
  4: {
    slug: 'principal-address',
    title: 'Principal place of business',
    subtitle: 'The physical or mailing location of your business operations.',
  },
  5: {
    slug: 'mailing-address',
    title: 'Mailing address',
    subtitle: 'Where you want official mail sent — can be the same as principal.',
  },
  6: {
    slug: 'registered-agent',
    title: 'Registered agent',
    subtitle: 'Required by Florida law. We can be yours, free for a year.',
  },
  7: {
    slug: 'managers',
    title: 'Members & Managers',
    subtitle: "Who's authorized to act on behalf of the company?",
  },
  8: {
    slug: 'correspondence',
    title: 'Where should we reach you?',
    subtitle: 'For state notices, document delivery, and account updates.',
  },
  9: {
    slug: 'optional',
    title: 'A few optional details',
    subtitle: 'Effective date, share count (Corp), professional purpose if applicable.',
  },
  10: {
    slug: 'review',
    title: 'Review & sign',
    subtitle: 'Confirm everything looks right and sign electronically.',
  },
  11: {
    slug: 'add-ons',
    title: 'Anything else?',
    subtitle: 'Compliance, banking, branding — included or à la carte.',
  },
  12: {
    slug: 'payment',
    title: 'Payment',
    subtitle: 'One-time, transparent, no subscription.',
  },
};
