// Constants used by the wizard. Kept separate from actions/wizard.ts because
// "use server" files can only export async functions.

export const TOTAL_STEPS = 11;

/**
 * Customer-facing journey phases. The 11 form steps are grouped into 5
 * phases so the customer feels they're moving through "Name → Setup →
 * Owners → Package → Pay" instead of "11 government-form steps". The
 * `WizardShell` renders the current phase next to the step counter.
 */
export type WizardPhase = {
  /** i18n key under `wizard.phase_*`. */
  key: 'name' | 'setup' | 'people' | 'package' | 'review';
  /** Inclusive step range this phase covers. */
  steps: number[];
};

export const WIZARD_PHASES: WizardPhase[] = [
  { key: 'name', steps: [1, 2] }, // entity + business name
  { key: 'setup', steps: [4, 5, 8] }, // addresses + optional details
  { key: 'people', steps: [6, 7] }, // RA + members/managers
  { key: 'package', steps: [3, 10] }, // tier + add-ons
  { key: 'review', steps: [9, 11] }, // review/sign + payment
];

export function phaseForStep(step: number): WizardPhase['key'] {
  return WIZARD_PHASES.find((p) => p.steps.includes(step))?.key ?? 'name';
}

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
    slug: 'optional',
    title: 'A few optional details',
    subtitle: 'Effective date, share count (Corp), professional purpose if applicable.',
  },
  9: {
    slug: 'review',
    title: 'Review & sign',
    subtitle: 'Confirm everything looks right and sign electronically.',
  },
  10: {
    slug: 'add-ons',
    title: 'Anything else?',
    subtitle: 'Compliance, banking, branding — included or à la carte.',
  },
  11: {
    slug: 'payment',
    title: 'Payment',
    subtitle: 'One-time, transparent, no subscription.',
  },
};
