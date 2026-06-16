-- AlterTable
-- Persist user-message attachments (images/files as data URIs, stored as JSONB)
-- and assistant reasoning/thinking content. Previously Message had no column for
-- either, so images sent for analysis and any reasoning trace were dropped on
-- reload. Both columns are nullable for backward compat: existing rows keep
-- working with no attachments and no reasoning.
--
-- Rollback:
--   ALTER TABLE "Message" DROP COLUMN "attachments", DROP COLUMN "reasoning";
ALTER TABLE "Message" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "reasoning" TEXT;
