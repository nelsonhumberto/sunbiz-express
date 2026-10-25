-- PayPal batch note for a commission marked paid by hand.
-- Additive: one nullable column on Filing. No drops, renames, or type changes.
-- Preview builds share one database, so this file is safe to apply while
-- older code is still running.

ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "commissionPayoutRef" TEXT;
