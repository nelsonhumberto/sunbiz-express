-- Extends 20261023120000_payment_is_test.
-- That migration is already applied in production. Its file stays unchanged
-- so prisma migrate deploy keeps the recorded checksum. This statement is
-- the additional backfill and is safe to re-run.
--
-- Flags pi_mock_auditor_paid and any $1.49 (149 cents) payment whose
-- createdAt falls on 2026-06-25. createdAt is timestamp without time zone
-- and stores the UTC clock time Prisma writes.
-- Does not delete rows and does not change filing status.

UPDATE "Payment"
SET "isTest" = true
WHERE "isTest" = false
  AND (
    "stripePaymentIntentId" = 'pi_mock_auditor_paid'
    OR (
      "amountCents" = 149
      AND "createdAt" >= TIMESTAMP '2026-06-25 00:00:00'
      AND "createdAt" < TIMESTAMP '2026-06-26 00:00:00'
    )
  );
