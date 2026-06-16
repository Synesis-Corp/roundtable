-- CreateTable
CREATE TABLE "CouncilTurn" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "winnerModelId" TEXT NOT NULL,
    "tallyFor" INTEGER NOT NULL,
    "tallyTotal" INTEGER NOT NULL,
    "consensus" BOOLEAN NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilVoice" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "approachLabel" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "proposalText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouncilTurn_messageId_key" ON "CouncilTurn"("messageId");

-- AddForeignKey
ALTER TABLE "CouncilTurn" ADD CONSTRAINT "CouncilTurn_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilVoice" ADD CONSTRAINT "CouncilVoice_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "CouncilTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
