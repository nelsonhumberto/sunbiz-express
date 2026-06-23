-- Admin fax tool (Telnyx): outbound + inbound fax records with stored media.
CREATE TABLE "FaxMessage" (
  "id"           TEXT NOT NULL,
  "direction"    TEXT NOT NULL,
  "toNumber"     TEXT,
  "fromNumber"   TEXT,
  "status"       TEXT NOT NULL DEFAULT 'queued',
  "telnyxFaxId"  TEXT,
  "mediaName"    TEXT,
  "mediaMime"    TEXT DEFAULT 'application/pdf',
  "mediaBase64"  TEXT,
  "mediaUrl"     TEXT,
  "accessToken"  TEXT,
  "pageCount"    INTEGER,
  "errorMessage" TEXT,
  "createdBy"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FaxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaxMessage_telnyxFaxId_key" ON "FaxMessage"("telnyxFaxId");
CREATE INDEX "FaxMessage_direction_createdAt_idx" ON "FaxMessage"("direction", "createdAt");
