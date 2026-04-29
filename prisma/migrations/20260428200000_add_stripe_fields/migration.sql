-- AlterTable User: add optional Stripe Customer ID
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- AlterTable Payment: add optional Stripe Payment Method ID
ALTER TABLE "Payment" ADD COLUMN "stripePaymentMethodId" TEXT;
