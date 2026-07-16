import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Logo } from '@/components/marketing/Logo';
import { COPYRIGHT_YEAR } from '@/lib/constants';
import { GuestStartForm } from './guest-start-form';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { filingUtmCreateFields } from '@/lib/utm-attribution';
import { localizedStateName, resolveMarketingState } from '@/lib/marketing-states';

export const dynamic = 'force-dynamic';

const VALID_TIERS = new Set(['BASIC', 'STANDARD', 'PREMIUM']);

function resolveTier(raw: string | undefined): 'BASIC' | 'STANDARD' | 'PREMIUM' {
  const upper = (raw ?? '').toUpperCase();
  return (VALID_TIERS.has(upper) ? upper : 'STANDARD') as
    | 'BASIC'
    | 'STANDARD'
    | 'PREMIUM';
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
    const entity =
      (searchParams?.entity ?? 'LLC').toUpperCase() === 'CORP' ? 'CORP' : 'LLC';
    const seededName = searchParams?.name?.trim().slice(0, 100) || null;
    const filing = await prisma.filing.create({
      data: {
        userId: session.user.id,
        entityType: entity,
        state: stateCode,
        serviceTier: resolveTier(searchParams?.tier),
        // Step 1 (entity + state) is implicitly complete because /start already
        // collected both. If the assistant also passed a business name, seed it
        // and skip to step 3.
        businessName: seededName,
        currentStep: seededName ? 3 : 2,
        completedSteps: JSON.stringify(seededName ? [1, 2] : [1]),
        ...filingUtmCreateFields(),
      },
    });
    redirect(`/wizard/${filing.id}/${seededName ? 3 : 2}`);
  }

  const t = await getTranslations('start');
  const locale = await getLocale();
  const requested = (searchParams?.state ?? 'FL').toUpperCase();
  const stateCode: StateCode = ACTIVE_FORMATION_STATES.includes(requested as StateCode)
    ? (requested as StateCode)
    : 'FL';
  const entityType = (searchParams?.entity ?? 'LLC').toUpperCase() === 'CORP' ? 'CORP' : 'LLC';
  const marketingState = resolveMarketingState(stateCode);
  const stateName = localizedStateName(marketingState, locale);
  const entityLabel =
    entityType === 'LLC' ? t('entityLLC') : t('entityCorp');

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="container py-6 flex items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm text-ink-muted hover:text-primary">
          {t('signInLink')}
        </Link>
      </header>

      <main className="flex-1 container max-w-3xl py-10">
        <div className="space-y-2 text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {t('kicker')}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">
            {t('headline', { state: stateName, entity: entityLabel })}
          </h1>
          <p className="text-ink-muted max-w-lg mx-auto">{t('subhead')}</p>
        </div>

        <GuestStartForm
          defaultState={stateCode}
          defaultEntity={entityType as 'LLC' | 'CORP'}
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

      <footer className="container py-6 text-xs text-ink-subtle text-center">
        © {COPYRIGHT_YEAR} LaunchForma
      </footer>
    </div>
  );
}
