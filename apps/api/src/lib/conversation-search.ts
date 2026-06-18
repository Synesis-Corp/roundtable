import { prisma } from './db';

export interface SearchResult {
  id: string;
  title: string;
  updatedAt: Date;
  matchedIn: 'title' | 'content';
  snippet: string | null;
}

interface RawSearchRow {
  id: string;
  title: string;
  updated_at: Date;
  matched_in: 'title' | 'content';
  snippet: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Escape HTML in a string, but preserve <mark>...</mark> wrapper tags that
 * Postgres ts_headline emits. This prevents XSS from user content in snippets
 * while keeping the highlight markup intact for the frontend renderer.
 *
 * Strategy:
 *  1. Split on <mark> and </mark>.
 *  2. Escape every text segment (outside mark tags).
 *  3. Re-join with literal <mark> and </mark>.
 *
 * Only `<mark>` (exact, lowercase, no attributes) is treated as safe HTML.
 * Everything else is entity-encoded.
 */
function escapeSnippet(raw: string): string {
  // Split on <mark> and </mark> boundaries
  const parts = raw.split(/(<mark>|<\/mark>)/);
  let result = '';
  let insideMark = false;

  for (const part of parts) {
    if (part === '<mark>') {
      result += '<mark>';
      insideMark = true;
    } else if (part === '</mark>') {
      result += '</mark>';
      insideMark = false;
    } else if (insideMark) {
      // Content inside <mark> is the search term — safe to pass through as-is
      // (it comes from the user's own query, not from stored content)
      result += escapeHtml(part);
    } else {
      // Content outside <mark> comes from stored message/title — must escape
      result += escapeHtml(part);
    }
  }

  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Full-text search over the authenticated user's conversations.
 *
 * Design (D2): UNION ALL title-hits + content-hits, DISTINCT ON deduplication,
 * ORDER BY title-boost / rank / updatedAt, LIMIT clamped to max 50.
 *
 * Safety (D4): userId + deletedAt IS NULL on every branch → ownership enforced
 * at the DB level. All values are bound parameters ($queryRaw tagged template)
 * → no SQL injection.
 *
 * XSS (guardrail 3): ts_headline output is run through escapeSnippet() before
 * returning, preserving only <mark>...</mark> tags and encoding everything else.
 */
export async function searchConversations(
  userId: string,
  q: string,
  limit: number = DEFAULT_LIMIT
): Promise<SearchResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const clampedLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  // UNION ALL:
  //   Branch 1: title-hits — search_tsv on Conversation, no snippet
  //   Branch 2: content-hits — search_tsv on Message, join to Conversation,
  //             ts_headline snippet from Message.content
  //
  // DISTINCT ON (id) keeps the highest-ranked row per conversation (ORDER
  // inside the CTE is: title_boost DESC, rank DESC so title hits win).
  const rows = await prisma.$queryRaw<RawSearchRow[]>`
    WITH hits AS (
      -- Branch 1: title match
      SELECT
        c.id,
        c.title,
        c."updatedAt" AS updated_at,
        'title'::text AS matched_in,
        NULL::text AS snippet,
        1 AS title_boost,
        ts_rank(c.search_tsv, websearch_to_tsquery('simple', ${trimmed})) AS rank
      FROM "Conversation" c
      WHERE
        c."userId" = ${userId}
        AND c."deletedAt" IS NULL
        AND c.search_tsv @@ websearch_to_tsquery('simple', ${trimmed})

      UNION ALL

      -- Branch 2: content match (join Message → Conversation)
      SELECT
        c.id,
        c.title,
        c."updatedAt" AS updated_at,
        'content'::text AS matched_in,
        ts_headline(
          'simple',
          m.content,
          websearch_to_tsquery('simple', ${trimmed}),
          'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=18'
        ) AS snippet,
        0 AS title_boost,
        ts_rank(m.search_tsv, websearch_to_tsquery('simple', ${trimmed})) AS rank
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE
        c."userId" = ${userId}
        AND c."deletedAt" IS NULL
        AND m.search_tsv @@ websearch_to_tsquery('simple', ${trimmed})
    ),
    deduped AS (
      SELECT DISTINCT ON (id)
        id, title, updated_at, matched_in, snippet, rank, title_boost
      FROM hits
      ORDER BY id, title_boost DESC, rank DESC
    )
    SELECT id, title, updated_at, matched_in, snippet
    FROM deduped
    ORDER BY title_boost DESC, rank DESC, updated_at DESC
    LIMIT ${clampedLimit}
  `;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at,
    matchedIn: r.matched_in,
    snippet: r.snippet != null ? escapeSnippet(r.snippet) : null,
  }));
}
