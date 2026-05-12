import { prisma } from '@/lib/db';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const states = await prisma.state.findMany({ orderBy: { stateCode: 'asc' } });
  return <SettingsClient states={states} />;
}
