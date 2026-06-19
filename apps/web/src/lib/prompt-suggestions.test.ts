import { describe, it, expect } from 'vitest';
import { buildPromptSuggestions } from './prompt-suggestions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function conv(id: string, title: string, updatedAt: string) {
  return { id, title, updatedAt };
}

describe('buildPromptSuggestions — contextual prompt heuristic', () => {
  it('returns no suggestions when there is no history (new user)', () => {
    expect(buildPromptSuggestions([])).toEqual([]);
  });

  it('does not invent suggestions from blank/whitespace titles', () => {
    const result = buildPromptSuggestions([
      conv('a', '   ', '2026-06-18T10:00:00.000Z'),
      conv('b', '', '2026-06-18T09:00:00.000Z'),
    ]);
    expect(result).toEqual([]);
  });

  it('marks the most recent conversation as "continue"', () => {
    const result = buildPromptSuggestions([
      conv('old', 'Older topic', '2026-06-17T10:00:00.000Z'),
      conv('new', 'Latest topic', '2026-06-18T10:00:00.000Z'),
    ]);
    expect(result[0]).toMatchObject({ kind: 'continue', title: 'Latest topic' });
  });

  it('marks subsequent conversations as "summarize"', () => {
    const result = buildPromptSuggestions([
      conv('a', 'First', '2026-06-18T12:00:00.000Z'),
      conv('b', 'Second', '2026-06-18T11:00:00.000Z'),
      conv('c', 'Third', '2026-06-18T10:00:00.000Z'),
    ]);
    expect(result.map((s) => s.kind)).toEqual(['continue', 'summarize', 'summarize']);
    expect(result.map((s) => s.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('sorts by updatedAt descending regardless of input order', () => {
    const result = buildPromptSuggestions([
      conv('mid', 'Mid', '2026-06-18T11:00:00.000Z'),
      conv('new', 'New', '2026-06-18T12:00:00.000Z'),
      conv('old', 'Old', '2026-06-18T10:00:00.000Z'),
    ]);
    expect(result.map((s) => s.title)).toEqual(['New', 'Mid', 'Old']);
  });

  it('caps suggestions at the default limit of 3', () => {
    const result = buildPromptSuggestions([
      conv('a', 'A', '2026-06-18T15:00:00.000Z'),
      conv('b', 'B', '2026-06-18T14:00:00.000Z'),
      conv('c', 'C', '2026-06-18T13:00:00.000Z'),
      conv('d', 'D', '2026-06-18T12:00:00.000Z'),
      conv('e', 'E', '2026-06-18T11:00:00.000Z'),
    ]);
    expect(result).toHaveLength(3);
  });

  it('honors an explicit limit', () => {
    const result = buildPromptSuggestions(
      [conv('a', 'A', '2026-06-18T15:00:00.000Z'), conv('b', 'B', '2026-06-18T14:00:00.000Z')],
      { limit: 1 }
    );
    expect(result).toHaveLength(1);
  });

  it('deduplicates by case-insensitive trimmed title (keeps the most recent)', () => {
    const result = buildPromptSuggestions([
      conv('a', 'Pagos', '2026-06-18T12:00:00.000Z'),
      conv('b', '  pagos  ', '2026-06-18T11:00:00.000Z'),
      conv('c', 'Otra cosa', '2026-06-18T10:00:00.000Z'),
    ]);
    expect(result.map((s) => s.title)).toEqual(['Pagos', 'Otra cosa']);
  });

  it('emits stable, unique React keys per suggestion', () => {
    const result = buildPromptSuggestions([
      conv('a', 'A', '2026-06-18T12:00:00.000Z'),
      conv('b', 'B', '2026-06-18T11:00:00.000Z'),
    ]);
    const keys = result.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
  });
});
