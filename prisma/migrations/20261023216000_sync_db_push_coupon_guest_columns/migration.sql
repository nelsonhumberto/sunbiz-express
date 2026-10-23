-- Production was partly built with `prisma db push`, so these objects exist
-- there but were not created by the earlier migration files:
--   tables Coupon, PasswordResetToken
--   User.isTester, User.guestToken
--   Filing.discountCents, Filing.couponCode, Filing.couponId
--   Payment.couponCode, Payment.discountCents
-- Idempotent (IF NOT EXISTS / guarded constraints) so this is a no-op on
-- production and on any database that already applied
-- 20261023210000_create_password_reset_token and 20261023215000_create_coupon.
-- Sorts before 20261023220000_enable_rls, which enables RLS on Coupon,
-- PasswordResetToken, and _prisma_migrations. Applied migration files are
-- left unchanged.
--
-- `prisma migrate diff --from-migrations` replays SQL on an empty shadow
-- database and does not create _prisma_migrations first. Create it here
-- (no-op on migrate deploy, which creates that table before any migration)
-- so the RLS migration can enable row level security on it.

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey'
  ) THEN
    ALTER TABLE "PasswordResetToken"
      ADD CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isTester" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "guestToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_guestToken_key" ON "User"("guestToken");

ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "couponId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Filing_couponId_fkey'
  ) THEN
    ALTER TABLE "Filing"
      ADD CONSTRAINT "Filing_couponId_fkey"
      FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
