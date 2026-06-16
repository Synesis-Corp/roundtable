-- CreateTable
CREATE TABLE "ActiveModelsConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveModelsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActiveModelsConfig_userId_providerId_key" ON "ActiveModelsConfig"("userId", "providerId");

-- AddForeignKey
ALTER TABLE "ActiveModelsConfig" ADD CONSTRAINT "ActiveModelsConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
