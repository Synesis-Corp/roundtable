-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Conversation_userId_deletedAt_idx" ON "Conversation"("userId", "deletedAt");
