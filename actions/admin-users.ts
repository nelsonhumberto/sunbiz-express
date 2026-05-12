'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/sign-in');
}

export async function setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { accountStatus: status } });
  revalidatePath('/admin/users');
}

export async function setUserRole(userId: string, role: 'USER' | 'ADMIN') {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath('/admin/users');
}
