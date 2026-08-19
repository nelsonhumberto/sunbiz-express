import Link from 'next/link';
import { Users, ShieldCheck, Ban, CheckCircle2, KeyRound, FlaskConical } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/utils';
import { setUserStatus, setUserRole, adminSendPasswordReset, toggleTester } from '@/actions/admin-users';
import { DeleteUserButton } from '@/components/admin/DeleteUserButton';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; role?: string; status?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const roleFilter = searchParams.role;
  const statusFilter = searchParams.status;

  const users = await prisma.user.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        roleFilter ? { role: roleFilter } : {},
        statusFilter ? { accountStatus: statusFilter } : {},
      ],
    },
    include: {
      _count: { select: { filings: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Users</h1>
          <p className="mt-1 text-ink-muted">{users.length} accounts</p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email…"
          className="h-9 rounded-md border border-border bg-white px-3 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 w-64"
        />
        <select
          name="role"
          defaultValue={roleFilter ?? ''}
          className="h-9 rounded-md border border-border bg-white px-3 text-sm text-ink"
        >
          <option value="">All roles</option>
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          name="status"
          defaultValue={statusFilter ?? ''}
          className="h-9 rounded-md border border-border bg-white px-3 text-sm text-ink"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <Button type="submit" size="sm" variant="outline">Filter</Button>
        <Link href="/admin/users">
          <Button size="sm" variant="ghost" type="button">Clear</Button>
        </Link>
      </form>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Tester', 'Filings', 'Joined', 'Last login', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-ink-muted">
                    <Users className="h-8 w-8 mx-auto mb-2 text-ink-subtle" />
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium whitespace-nowrap">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-5 py-3 text-ink-muted text-xs">{user.email}</td>
                    <td className="px-5 py-3">
                      {user.role === 'ADMIN' ? (
                        <Badge variant="accent" size="sm" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" size="sm">User</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {user.accountStatus === 'ACTIVE' ? (
                        <Badge variant="success" size="sm">Active</Badge>
                      ) : (
                        <Badge variant="warn" size="sm">Suspended</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {user.isTester ? (
                        <form action={toggleTester.bind(null, user.id, false)}>
                          <button type="submit" title="Remove tester flag">
                            <Badge variant="warn" size="sm" className="gap-1 cursor-pointer hover:opacity-80">
                              <FlaskConical className="h-3 w-3" /> Tester
                            </Badge>
                          </button>
                        </form>
                      ) : (
                        <form action={toggleTester.bind(null, user.id, true)}>
                          <button type="submit" title="Mark as tester">
                            <Badge variant="secondary" size="sm" className="gap-1 cursor-pointer hover:opacity-80 text-ink-subtle">
                              <FlaskConical className="h-3 w-3" /> Off
                            </Badge>
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums">{user._count.filings}</td>
                    <td className="px-5 py-3 text-ink-muted text-xs whitespace-nowrap">
                      {formatRelative(user.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-ink-muted text-xs whitespace-nowrap">
                      {user.lastLogin ? formatRelative(user.lastLogin) : '-'}
                    </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Ban / Activate */}
                          {user.accountStatus === 'ACTIVE' ? (
                            <form action={setUserStatus.bind(null, user.id, 'SUSPENDED')}>
                              <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5 text-xs">
                                <Ban className="h-3 w-3" /> Suspend
                              </Button>
                            </form>
                          ) : (
                            <form action={setUserStatus.bind(null, user.id, 'ACTIVE')}>
                              <Button size="sm" variant="outline" className="gap-1 text-success border-success/30 hover:bg-success/5 text-xs">
                                <CheckCircle2 className="h-3 w-3" /> Activate
                              </Button>
                            </form>
                          )}
                          {/* Role toggle */}
                          {user.role === 'USER' ? (
                            <form action={setUserRole.bind(null, user.id, 'ADMIN')}>
                              <Button size="sm" variant="ghost" className="text-xs">→ Admin</Button>
                            </form>
                          ) : (
                            <form action={setUserRole.bind(null, user.id, 'USER')}>
                              <Button size="sm" variant="ghost" className="text-xs">→ User</Button>
                            </form>
                          )}
                          {/* Send password reset */}
                          <form action={adminSendPasswordReset.bind(null, user.id)}>
                            <Button size="sm" variant="ghost" className="gap-1 text-xs text-ink-muted" title="Send password reset email">
                              <KeyRound className="h-3 w-3" /> Reset pwd
                            </Button>
                          </form>
                          {/* Delete user */}
                          <DeleteUserButton userId={user.id} email={user.email} />
                        </div>
                      </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
