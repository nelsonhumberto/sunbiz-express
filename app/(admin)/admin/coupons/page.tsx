import { Tag, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatRelative } from '@/lib/utils';
import { createCoupon, toggleCoupon, deleteCoupon } from '@/actions/coupons';
import { CouponCreateForm } from './coupon-create-form';

export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div className="container max-w-5xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Coupon codes</h1>
        <p className="mt-1 text-ink-muted">
          Create and manage discount codes. Customers enter them at checkout.
        </p>
      </div>

      {/* Create form */}
      <Card>
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4" /> Create new coupon
          </h2>
          <CouponCreateForm createAction={createCoupon} />
        </CardContent>
      </Card>

      {/* Coupons list */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Code', 'Type', 'Value', 'Used / Max', 'Expires', 'Status', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-ink-muted">
                    <Tag className="h-8 w-8 mx-auto mb-2 text-ink-subtle" />
                    No coupons yet. Create your first one above.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => {
                  const isExpired = c.expiresAt ? c.expiresAt < new Date() : false;
                  const isExhausted = c.maxUses !== null && c.usedCount >= c.maxUses;
                  const effectivelyInactive = !c.active || isExpired || isExhausted;

                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <code className="font-mono text-sm font-semibold tracking-widest">{c.code}</code>
                        {c.description && (
                          <p className="text-xs text-ink-muted mt-0.5">{c.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="secondary" size="sm">{c.type}</Badge>
                      </td>
                      <td className="px-5 py-3 font-medium tabular-nums">
                        {c.type === 'PERCENT'
                          ? `${c.value}%`
                          : formatCurrency(c.value)}
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        <span className={isExhausted ? 'text-destructive font-medium' : ''}>
                          {c.usedCount}
                        </span>
                        {' / '}
                        <span>{c.maxUses ?? '∞'}</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-muted whitespace-nowrap">
                        {c.expiresAt ? (
                          <span className={isExpired ? 'text-destructive font-medium' : ''}>
                            {c.expiresAt.toLocaleDateString()}
                          </span>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {effectivelyInactive ? (
                          <Badge variant="warn" size="sm">
                            {isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Inactive'}
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">Active</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-muted whitespace-nowrap">
                        {formatRelative(c.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          {/* Toggle active */}
                          <form action={toggleCoupon.bind(null, c.id, !c.active)}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`gap-1 text-xs ${c.active ? 'text-success' : 'text-ink-muted'}`}
                              title={c.active ? 'Deactivate' : 'Activate'}
                            >
                              {c.active
                                ? <ToggleRight className="h-4 w-4" />
                                : <ToggleLeft className="h-4 w-4" />}
                              {c.active ? 'On' : 'Off'}
                            </Button>
                          </form>
                          {/* Delete */}
                          <form action={deleteCoupon.bind(null, c.id)}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
