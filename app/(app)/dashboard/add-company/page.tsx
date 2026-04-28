import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { AddCompanyForm } from '@/components/dashboard/AddCompanyForm';

export const dynamic = 'force-dynamic';

export default async function AddCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const t = await getTranslations('addCompany');

  return (
    <div className="container max-w-3xl py-10 space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-ink-muted max-w-xl">{t('subtitle')}</p>
      </div>
      <AddCompanyForm />
    </div>
  );
}
