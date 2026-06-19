/* ------------------------------------------------------------------ */
/*  Contextual prompt suggestions (#3 — heuristic, no LLM, no network). */
/*  Pure function: derives suggested prompts from the user's recent     */
/*  conversations. The component maps each descriptor to a localized    */
/*  string via i18n (same split as buildGreeting).                      */
/* ------------------------------------------------------------------ */

export type PromptSuggestionKind = 'continue' | 'summarize';

export interface PromptSuggestion {
  /** Stable, unique React key. */
  key: string;
  /** Heuristic role: resume the latest thread vs. recap an older one. */
  kind: PromptSuggestionKind;
  /** Conversation title interpolated into the localized template. */
  title: string;
}

/** Minimal shape needed from a conversation — decoupled from the SDK type. */
export interface SuggestionSource {
  id: string;
  title: string;
  updatedAt: string;
}

const DEFAULT_LIMIT = 3;

/**
 * Build contextual prompt suggestions from recent conversations.
 *
 * Heuristic (deterministic, pure):
 * - Drop blank/whitespace-only titles (no usage signal there).
 * - Sort by `updatedAt` descending so the freshest topic leads.
 * - Deduplicate by case-insensitive trimmed title, keeping the most recent.
 * - The single most recent → `continue`; the rest → `summarize`.
 * - Cap at `limit` (default 3).
 *
 * Returns `[]` when there is no usable history — the caller falls back to the
 * static QuickActions, so we never invent "usage-based" prompts for users with
 * zero usage.
 */
export function buildPromptSuggestions(
  conversations: SuggestionSource[],
  options?: { limit?: number }
): PromptSuggestion[] {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  const withTitle = conversations.filter((c) => c.title.trim().length > 0);

  const sorted = [...withTitle].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const seen = new Set<string>();
  const deduped: SuggestionSource[] = [];
  for (const c of sorted) {
    const norm = c.title.trim().toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    deduped.push(c);
  }

  return deduped.slice(0, limit).map((c, i) => ({
    key: c.id,
    kind: i === 0 ? 'continue' : 'summarize',
    title: c.title.trim(),
  }));
}
