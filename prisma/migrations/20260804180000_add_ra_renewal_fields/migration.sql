-- RegisteredAgentService: renewal pricing + auto-renew mandate + Phase 2 charge bookkeeping.
--
-- renewalPriceCents is snapshotted per service so a later change to the
-- canonical price never re-prices an existing customer. The column default is
-- the current price ($150); existing rows are backfilled below to $119, the
-- price those customers were quoted by the wizard at signup (grandfathering).
ALTER TABLE "RegisteredAgentService"
  ADD COLUMN "renewalPriceCents" INTEGER NOT NULL DEFAULT 15000,
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoRenewConsentAt" TIMESTAMP(3),
  ADD COLUMN "renewalAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRenewalError" TEXT;

-- Grandfather every RA service that already exists at deploy time to the $119
-- price promised by the wizard. New rows created after this migration inherit
-- the current price ($150) via the column default / explicit set at creation.
UPDATE "RegisteredAgentService" SET "renewalPriceCents" = 11900;
