-- EmailNotification.status is text, not a Postgres enum, so a new
-- status value does not need a type change. SKIPPED_TEST means a qa+ or
-- e2e+ recipient was not delivered.
COMMENT ON COLUMN "EmailNotification"."status" IS 'QUEUED | PENDING | SENT | FAILED | BOUNCED | SKIPPED_TEST';
