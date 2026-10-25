-- Additive daily spend ledger for the Forma assistant.
-- Does not alter AssistantConversation or AssistantMessage.

CREATE TABLE "AssistantSpendDay" (
    "day" DATE NOT NULL,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSpendDay_pkey" PRIMARY KEY ("day")
);

ALTER TABLE "AssistantSpendDay" ENABLE ROW LEVEL SECURITY;
