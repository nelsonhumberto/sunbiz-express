-- Resume drip: claim a row before sending so overlapping crons cannot both send.
-- The unique index is partial. Other notification types may repeat, and
-- Postgres treats NULL step values as distinct, so step is backfilled first.

ALTER TABLE "EmailNotification" ADD COLUMN IF NOT EXISTS "step" TEXT;
ALTER TABLE "EmailNotification" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailNotification" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

ALTER TABLE "Filing" ADD COLUMN IF NOT EXISTS "entryPath" TEXT;

DELETE FROM "EmailNotification"
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "filingId", "notificationType"
        ORDER BY
          CASE WHEN status = 'SENT' THEN 0 ELSE 1 END,
          "createdAt" DESC,
          id DESC
      ) AS rn
    FROM "EmailNotification"
    WHERE "notificationType" IN ('RESUME_1H', 'RESUME_1D', 'RESUME_3D')
      AND "filingId" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

UPDATE "EmailNotification"
SET "step" = "notificationType"
WHERE "notificationType" IN ('RESUME_1H', 'RESUME_1D', 'RESUME_3D')
  AND "filingId" IS NOT NULL
  AND "step" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "EmailNotification_filingId_notificationType_step_key"
ON "EmailNotification" ("filingId", "notificationType", "step")
WHERE "notificationType" IN ('RESUME_1H', 'RESUME_1D', 'RESUME_3D')
  AND "filingId" IS NOT NULL
  AND "step" IS NOT NULL;
