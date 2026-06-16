-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceConversationId" TEXT,
    "tags" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Memory_source_check" CHECK (
        ("sourceType" IS NULL AND "sourceConversationId" IS NULL)
        OR ("sourceType" = 'manual' AND "sourceConversationId" IS NULL)
        OR ("sourceType" = 'conversation' AND "sourceConversationId" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "Memory_userId_updatedAt_idx" ON "Memory"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Memory"
ADD CONSTRAINT "Memory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
