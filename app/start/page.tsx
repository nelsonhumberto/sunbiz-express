import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Logo } from '@/components/marketing/Logo';
import { COPYRIGHT_YEAR } from '@/lib/constants';
import { GuestStartForm } from './guest-start-form';
import {
  ACTIVE_FORMATION_STATES,
  getFormationState,
  type StateCode,
} from '@/lib/formation-states';
import { filingUtmCreateFields } from '@/lib/utm-attribution';

export const dynamic = 'force-dynamic';

interface StartPageProps {
  searchParams?: { state?: string; entity?: string };
}

export default async function StartPage({ searchParams }: StartPageProps) {
  const session = await auth();
  // If already signed in, skip the guest form: spin up a draft directly in
  // the chosen state and jump them straight into the wizard.
  if (session?.user?.id) {
    const requested = (searchParams?.state ?? 'FL').toUpperCase();
    const stateCode = (ACTIVE_FORMATION_STATES.includes(requested as StateCode)
      ? requested
      : 'FL') as StateCode;
    const entity =
      (searchParams?.entity ?? 'LLC').toUpperCase() === 'CORP' ? 'CORP' : 'LLC';
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType: entity,
        state: stateCode,
        serviceTier: 'STANDARD',
        // Step 1 (entity + state) is implicitly complete because /start
        // already collected both — jump straight into the name step.
        currentStep: 2,
        completedSteps: JSON.stringify([1]),
        ...filingUtmCreateFields(),
      },
    });
    redirect(`/wizard/${filing.id}/2`);
  }

  const requested = (searchParams?.state ?? 'FL').toUpperCase();
  const stateCode: StateCode = ACTIVE_FORMATION_STATES.includes(requested as StateCode)
    ? (requested as StateCode)
    : 'FL';
  const entityType = (searchParams?.entity ?? 'LLC').toUpperCase() === 'CORP' ? 'CORP' : 'LLC';
  const stateRule = getFormationState(stateCode);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="container py-6 flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm text-ink-muted hover:text-primary">
          Already a customer? Sign in →
        </Link>
      </header>

      <main className="flex-1 container max-w-3xl py-10">
        <div className="space-y-2 text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Start your filing
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
            Form your{' '}
            <span className="italic text-primary">{stateRule.name}</span>{' '}
            {entityType === 'LLC' ? 'LLC' : 'Corporation'}
          </h1>
          <p className="text-ink-muted max-w-lg mx-auto">
            We just need a few details to spin up your draft — no account
            required, no credit card to begin.
          </p>
        </div>

        <GuestStartForm
          defaultState={stateCode}
          defaultEntity={entityType as 'LLC' | 'CORP'}
        />

        <p className="text-xs text-ink-subtle text-center mt-6 max-w-md mx-auto leading-relaxed">
          By continuing you agree to our{' '}
          <Link href="/terms" className="underline hover:text-ink-muted">Terms</Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-ink-muted">Privacy Policy</Link>.
        </p>
      </main>

      <footer className="container py-6 text-xs text-ink-subtle text-center">
        © {COPYRIGHT_YEAR} LaunchForma
      </footer>
    </div>
  );
}
