-- Add pending-state lifecycle columns to Document so add-on placeholders
-- (Certificate of Status / Certified Copy / EIN Letter / etc.) can be
-- created at submit time and later replaced when admin uploads the real
-- PDF received from Florida or the IRS.

ALTER TABLE "Document" ADD COLUMN "pendingState" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "uploadedAt" TIMESTAMP(3);
