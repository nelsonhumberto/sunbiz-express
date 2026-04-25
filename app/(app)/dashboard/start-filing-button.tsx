'use client';

import { Plus } from 'lucide-react';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { createFiling } from '@/actions/filings';

export function StartFilingButton({ entityType }: { entityType?: 'LLC' | 'CORP' }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={async () => {
        start(async () => {
          await createFiling({ entityType });
        });
      }}
    >
      <Button type="submit" size="lg" disabled={pending} className="group">
        <Plus className="h-4 w-4" />
        {pending ? 'Starting…' : 'Start a new filing'}
      </Button>
    </form>
  );
}
