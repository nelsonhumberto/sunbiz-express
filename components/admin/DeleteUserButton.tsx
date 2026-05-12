'use client';

import { useTransition } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteUser } from '@/actions/admin-users';

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (!confirm(`Delete ${email} and ALL their data?\n\nThis removes their filings, payments, and documents and cannot be undone.`)) return;
    start(() => deleteUser(userId));
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive hover:bg-destructive/10"
      title="Delete user"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}
