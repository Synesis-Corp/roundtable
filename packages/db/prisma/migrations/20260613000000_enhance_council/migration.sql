-- Add council enhancement fields: angles, sources, confidence, risk, reasoning, metrics.

ALTER TABLE "CouncilTurn" ADD COLUMN IF NOT EXISTS "confidence" TEXT;
ALTER TABLE "CouncilTurn" ADD COLUMN IF NOT EXISTS "searchSources" JSONB;
ALTER TABLE "CouncilTurn" ADD COLUMN IF NOT EXISTS "deliberationMs" INTEGER;

ALTER TABLE "CouncilVoice" ADD COLUMN IF NOT EXISTS "angle" TEXT;
ALTER TABLE "CouncilVoice" ADD COLUMN IF NOT EXISTS "sources" JSONB;
ALTER TABLE "CouncilVoice" ADD COLUMN IF NOT EXISTS "confidence" TEXT;
ALTER TABLE "CouncilVoice" ADD COLUMN IF NOT EXISTS "risk" TEXT;
ALTER TABLE "CouncilVoice" ADD COLUMN IF NOT EXISTS "reasoning" TEXT;
