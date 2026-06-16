-- Add githubId to User for the GitHub OAuth provider.
-- Mirrors googleId: optional, unique. Nullable because users may continue
-- signing up with email/password or Google without ever linking GitHub.
ALTER TABLE "User" ADD COLUMN "githubId" TEXT;
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");
