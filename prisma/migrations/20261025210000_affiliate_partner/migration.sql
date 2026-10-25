-- Invite-only affiliate partners. Additive only: new enum types, one new
-- table, and nullable columns. No drops, renames, or type changes on
-- existing columns. Preview builds share one database, so this file is
-- safe to apply while older code is still running.
--
-- Partner rows are written by the app through Prisma (the table owner).
-- Row level security is on and there are no anon policies.

DO $$ BEGIN
  CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REMOVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralSource" AS ENUM ('LINK', 'PROMO_CODE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REVERSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Partner" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "paypalEmail" TEXT,
    "stripePromotionCodeId" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Partner_code_key" ON "Partner"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Partner_stripePromotionCodeId_key" ON "Partner"("stripePromotionCodeId");

ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "referralPartnerId" TEXT;
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "referralSource" "ReferralSource";
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "referralCapturedAt" TIMESTAMP(3);
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "commissionCents" INTEGER;
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "commissionStatus" "CommissionStatus";

ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "referralPartnerId" TEXT;
ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "referralSource" "ReferralSource";
ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "referralCapturedAt" TIMESTAMP(3);
ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "commissionCents" INTEGER;
ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "commissionStatus" "CommissionStatus";

CREATE INDEX IF NOT EXISTS "Filing_referralPartnerId_idx" ON "Filing"("referralPartnerId");
CREATE INDEX IF NOT EXISTS "Filing_commissionStatus_idx" ON "Filing"("commissionStatus");
CREATE INDEX IF NOT EXISTS "ServiceInquiry_referralPartnerId_idx" ON "ServiceInquiry"("referralPartnerId");

DO $$ BEGIN
  ALTER TABLE "Filing" ADD CONSTRAINT "Filing_referralPartnerId_fkey"
    FOREIGN KEY ("referralPartnerId") REFERENCES "Partner"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceInquiry" ADD CONSTRAINT "ServiceInquiry_referralPartnerId_fkey"
    FOREIGN KEY ("referralPartnerId") REFERENCES "Partner"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Partner" ENABLE ROW LEVEL SECURITY;
