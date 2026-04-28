import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export async function AddExistingCompanyButton() {
  const t = await getTranslations('dashboard');
  return (
    <Button variant="outline" size="lg" asChild className="group">
      <Link href="/dashboard/add-company" className="inline-flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        {t('addExistingCompany')}
      </Link>
    </Button>
  );
}
