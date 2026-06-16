-- CreateTable
-- Usage metrics are intentionally independent from Message persistence so
-- ephemeral/incognito turns can still be measured without creating a
-- Conversation or Message row.
--
-- Rollback:
--   DROP TABLE "UsageEvent";
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'single',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the metrics that were previously derived from persisted assistant
-- messages. Reusing Message.id is safe because UsageEvent is a new table and
-- avoids depending on a database UUID extension. Soft-deleted conversations
-- were excluded by the legacy dashboard, so they remain excluded here.
INSERT INTO "UsageEvent" (
    "id",
    "userId",
    "providerId",
    "modelId",
    "inputTokens",
    "outputTokens",
    "latencyMs",
    "mode",
    "createdAt"
)
SELECT
    message."id",
    conversation."userId",
    message."providerId",
    message."modelId",
    COALESCE(message."inputTokens", 0),
    COALESCE(message."outputTokens", 0),
    message."latencyMs",
    CASE WHEN message."providerId" = 'council' THEN 'council' ELSE 'single' END,
    message."createdAt"
FROM "Message" AS message
INNER JOIN "Conversation" AS conversation
    ON conversation."id" = message."conversationId"
WHERE message."role" = 'assistant'
  AND message."providerId" IS NOT NULL
  AND message."modelId" IS NOT NULL
  AND conversation."deletedAt" IS NULL;
