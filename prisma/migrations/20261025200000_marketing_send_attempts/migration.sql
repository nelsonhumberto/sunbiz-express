-- Attempt counts for post-formation and newsletter claims.
-- Additive only. Existing rows start at 0 and can still be retried.

ALTER TABLE "NewsletterSend" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostFormationSend" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
