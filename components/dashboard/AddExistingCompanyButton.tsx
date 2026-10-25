import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link2 } from 'lucide-react';
import { hrefForLocale } from '@/lib/app-href';
import { Button } from '@/components/ui/button';

export async function AddExistingCompanyButton() {
  const t = await getTranslations('dashboard');
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';
  return (
    <Button
      variant="outline"
      size="lg"
      asChild
      className="group w-full min-w-0 sm:w-auto whitespace-normal sm:whitespace-nowrap h-auto min-h-12 px-4 sm:px-8 text-center"
    >
      <Link href={hrefForLocale('/dashboard/add-company', locale)} className="inline-flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        {t('addExistingCompany')}
      </Link>
    </Button>
  );
}
