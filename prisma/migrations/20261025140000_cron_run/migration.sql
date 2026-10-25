-- Heartbeat rows for /api/cron/recovery. Additive only.

CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt");

ALTER TABLE "CronRun" ENABLE ROW LEVEL SECURITY;
