-- CreateTable
CREATE TABLE "CouncilConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelIds" TEXT[],
    "mode" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouncilConfig_userId_key" ON "CouncilConfig"("userId");

-- AddForeignKey
ALTER TABLE "CouncilConfig" ADD CONSTRAINT "CouncilConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
