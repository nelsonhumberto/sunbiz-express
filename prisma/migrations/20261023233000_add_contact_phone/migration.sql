-- Optional contact phone collected on the wizard contact step.
-- Idempotent: User.phone already exists on databases created from the init
-- migration, and this file is safe to re-run.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
