import { Handshake } from 'lucide-react';
import { prisma } from '@/lib/db';
import { affiliateEnabled } from '@/lib/affiliate';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { createPartner, setPartnerStatus, updatePartner } from '@/actions/admin-partners';
import { PartnerCreateForm, PartnerEditForm } from './partner-forms';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  ACTIVE: 'success',
  PAUSED: 'warn',
  REMOVED: 'secondary',
} as const;

export default async function AdminPartnersPage() {
  const partners = await prisma.partner.findMany({ orderBy: { createdAt: 'desc' } });
  const enabled = affiliateEnabled();

  return (
    <div className="container max-w-5xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Affiliate partners</h1>
        <p className="mt-1 text-ink-muted">
          Invite-only partners. Payouts are PayPal, recorded by hand. There is no partner portal.
        </p>
      </div>

      {enabled ? null : (
        <Card>
          <CardContent className="p-4 text-sm text-ink-muted">
            Affiliate capture is off. You can still add and edit partners. Set AFFILIATE_ENABLED
            before referral links or promotion codes are recorded on orders.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Handshake className="h-4 w-4" /> New partner
          </h2>
          <PartnerCreateForm createAction={createPartner} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {partners.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-ink-muted">No partners yet.</CardContent>
          </Card>
        ) : (
          partners.map((partner) => (
            <Card key={partner.id}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <code className="font-mono text-sm font-semibold tracking-widest">{partner.code}</code>
                  <Badge variant={STATUS_VARIANT[partner.status]} size="sm">
                    {partner.status}
                  </Badge>
                </div>
                <PartnerEditForm
                  partner={partner}
                  updateAction={updatePartner}
                  statusAction={setPartnerStatus}
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
