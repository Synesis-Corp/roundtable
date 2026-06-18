-- Migration: 20260618000000_add_conversation_fts
-- Adds STORED GENERATED tsvector columns + GIN indexes for full-text search.
--
-- Language: 'simple' — bilingual (ES/EN). simple does no stemming so neither
-- language mangles the other. No morphological match at this scale; prefix :*
-- can be added later without a migration change.
--
-- Safety: GENERATED ALWAYS AS ... STORED backfills existing rows automatically
-- when the column is added. No separate UPDATE required.
--
-- Locking notes:
--   ADD COLUMN GENERATED STORED  → ACCESS EXCLUSIVE (rewrites table)
--   CREATE INDEX USING GIN        → SHARE lock
-- Both are sub-second at current scale. Scale-up escape hatch: convert to
-- nullable col + batch backfill + CREATE INDEX CONCURRENTLY (outside txn).
--
-- ABORT-on-fail: this file runs inside a transaction managed by prisma
-- migrate. Any statement failure rolls back the entire migration.

ALTER TABLE "Conversation"
  ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("title", ''))
  ) STORED;

CREATE INDEX "Conversation_search_tsv_idx"
  ON "Conversation" USING GIN ("search_tsv");

ALTER TABLE "Message"
  ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("content", ''))
  ) STORED;

CREATE INDEX "Message_search_tsv_idx"
  ON "Message" USING GIN ("search_tsv");

-- ROLLBACK (run manually to revert this migration):
-- DROP INDEX IF EXISTS "Message_search_tsv_idx";
-- ALTER TABLE "Message" DROP COLUMN IF EXISTS "search_tsv";
-- DROP INDEX IF EXISTS "Conversation_search_tsv_idx";
-- ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "search_tsv";
