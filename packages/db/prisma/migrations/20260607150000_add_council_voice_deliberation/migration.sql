-- AlterTable
-- Persist the full per-round deliberation (debate evaluation and vote rationale)
-- so the council journey can be replayed step-by-step from history, not just
-- the final synthesized answer. All columns are nullable for backward compat:
-- existing CouncilVoice rows keep working and simply have no debate/vote detail.
--
-- Rollback:
--   ALTER TABLE "CouncilVoice"
--     DROP COLUMN "debateText",
--     DROP COLUMN "voteReason",
--     DROP COLUMN "voteImprovement";
ALTER TABLE "CouncilVoice" ADD COLUMN "debateText" TEXT,
ADD COLUMN "voteReason" TEXT,
ADD COLUMN "voteImprovement" TEXT;
