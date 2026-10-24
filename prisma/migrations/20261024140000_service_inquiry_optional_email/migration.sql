-- The business-services form no longer requires an email address.
-- Phone or WhatsApp is the contact channel. Existing rows keep their email.

ALTER TABLE "ServiceInquiry" ALTER COLUMN "email" DROP NOT NULL;
