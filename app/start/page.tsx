import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Logo } from '@/components/marketing/Logo';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import { COPYRIGHT_YEAR } from '@/lib/constants';
import { GuestStartForm } from './guest-start-form';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { filingUtmCreateFields } from '@/lib/utm-attribution';
import { syncSCorpElectionAddOn } from '@/actions/wizard';
import type { TierSlug } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const VALID_TIERS = new Set(['BASIC', 'STANDARD', 'PREMIUM']);

function resolveTier(raw: string | undefined): 'BASIC' | 'STANDARD' | 'PREMIUM' {
  const upper = (raw ?? '').toUpperCase();
  return (VALID_TIERS.has(upper) ? upper : 'STANDARD') as
    | 'BASIC'
    | 'STANDARD'
    | 'PREMIUM';
}

function resolveEntityParam(raw: string | undefined): {
  choice: 'LLC' | 'CORP' | 'SCORP';
  entityType: 'LLC' | 'CORP';
  taxElection: 'S_CORP' | null;
} {
  const upper = (raw ?? 'LLC').toUpperCase();
  if (upper === 'SCORP' || upper === 'S-CORP' || upper === 'S_CORP') {
    return { choice: 'SCORP', entityType: 'CORP', taxElection: 'S_CORP' };
  }
  if (upper === 'CORP' || upper === 'CORPORATION') {
    return { choice: 'CORP', entityType: 'CORP', taxElection: null };
  }
  return { choice: 'LLC', entityType: 'LLC', taxElection: null };
}

interface StartPageProps {
  searchParams?: { state?: string; entity?: string; tier?: string; name?: string };
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
    const { entityType, taxElection } = resolveEntityParam(searchParams?.entity);
    const seededName = searchParams?.name?.trim().slice(0, 100) || null;
    const serviceTier = resolveTier(searchParams?.tier);
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType,
        taxElection,
        state: stateCode,
        serviceTier,
        // Step 1 (entity + state) is implicitly complete because /start already
        // collected both. If the assistant also passed a business name, seed it
        // and skip to step 3.
        businessName: seededName,
        currentStep: seededName ? 3 : 2,
        completedSteps: JSON.stringify(seededName ? [1, 2] : [1]),
        ...filingUtmCreateFields(),
      },
    });
    await syncSCorpElectionAddOn(filing.id, taxElection === 'S_CORP', serviceTier as TierSlug);
    redirect(`/wizard/${filing.id}/${seededName ? 3 : 2}`);
  }

  const t = await getTranslations('start');
  const tDisc = await getTranslations('disclosure');
  const requested = (searchParams?.state ?? 'FL').toUpperCase();
  const stateCode: StateCode = ACTIVE_FORMATION_STATES.includes(requested as StateCode)
    ? (requested as StateCode)
    : 'FL';
  const { choice: entityChoice } = resolveEntityParam(searchParams?.entity);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="container py-6 flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm text-ink-muted hover:text-primary">
          {t('signInLink')}
        </Link>
      </header>

      <main className="flex-1 container max-w-3xl py-10">
        <GuestStartForm
          defaultState={stateCode}
          defaultEntity={entityChoice}
          defaultTier={resolveTier(searchParams?.tier)}
          defaultBusinessName={searchParams?.name?.trim().slice(0, 100) || undefined}
        />

        <p className="text-xs text-ink-subtle text-center mt-6 max-w-md mx-auto leading-relaxed">
          {t('termsPrefix')}{' '}
          <Link href="/terms" className="underline hover:text-ink-muted">
            {t('terms')}
          </Link>{' '}
          {t('and')}{' '}
          <Link href="/privacy" className="underline hover:text-ink-muted">
            {t('privacy')}
          </Link>
          .
        </p>
      </main>

      <footer className="container py-6 text-center">
        <GovDisclosure text={tDisc('notAffiliated')} className="mb-3 max-w-2xl" />
        <p className="text-xs text-ink-subtle">© {COPYRIGHT_YEAR} LaunchForma</p>
      </footer>
    </div>
  );
}
