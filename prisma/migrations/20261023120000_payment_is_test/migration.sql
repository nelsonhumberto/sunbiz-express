-- Flag test, mock, and tester-bypass payments so they drop out of admin revenue.
-- Does not touch filing status or any other filing columns.

ALTER TABLE "Payment" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Payment"
SET "isTest" = true
WHERE "stripePaymentIntentId" LIKE 'pi_mock_%'
   OR "stripePaymentIntentId" LIKE 'TESTER_%'
   OR "id" = 'cmqtxu5s30001t4tfjq8y4zll';
