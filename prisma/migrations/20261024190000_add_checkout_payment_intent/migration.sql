-- Reuse one checkout PaymentIntent per filing while it can still be confirmed.
-- Idempotent so a retried migrate does not fail if the column is already there.
ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "checkoutPaymentIntentId" TEXT;
