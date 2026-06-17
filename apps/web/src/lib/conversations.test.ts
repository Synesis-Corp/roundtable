import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groupConversationsByDate, formatConversationTime } from './conversations';
import type { Conversation } from '@chat/sdk';

function makeConv(id: string, title: string, date: Date): Conversation {
  return { id, title, updatedAt: date.toISOString() };
}

describe('groupConversationsByDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array when no conversations', () => {
    vi.setSystemTime(new Date(2026, 5, 6, 14, 30, 0));
    expect(groupConversationsByDate([])).toEqual([]);
  });

  it('sorts conversations by updatedAt descending', () => {
    vi.setSystemTime(new Date(2026, 5, 6, 14, 30, 0));
    const convs: Conversation[] = [
      makeConv('a', 'Old', new Date(2026, 5, 4, 10, 0, 0)),
      makeConv('b', 'New', new Date(2026, 5, 6, 12, 0, 0)),
      makeConv('c', 'Mid', new Date(2026, 5, 5, 8, 0, 0)),
    ];
    const groups = groupConversationsByDate(convs);
    const allIds = groups.flatMap((g) => g.conversations.map((c) => c.id));
    expect(allIds).toEqual(['b', 'c', 'a']);
  });

  it('groups conversations into correct buckets', () => {
    // Fixed "now": June 15, 2026 14:30 local time
    vi.setSystemTime(new Date(2026, 5, 15, 14, 30, 0));

    const convs: Conversation[] = [
      makeConv('today', 'Today conv', new Date(2026, 5, 15, 10, 0, 0)),
      makeConv('yesterday', 'Yesterday conv', new Date(2026, 5, 14, 9, 0, 0)),
      makeConv('this-week', 'This week conv', new Date(2026, 5, 10, 8, 0, 0)),
      makeConv('this-month', 'This month conv', new Date(2026, 5, 5, 7, 0, 0)),
      makeConv('older', 'Older conv', new Date(2026, 4, 15, 6, 0, 0)),
    ];

    const groups = groupConversationsByDate(convs);
    expect(groups.map((g) => g.key)).toEqual([
      'today',
      'yesterday',
      'thisWeek',
      'thisMonth',
      'older',
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      'Today',
      'Yesterday',
      'This week',
      'This month',
      'Older',
    ]);
    expect(groups[0].conversations.map((c) => c.id)).toEqual(['today']);
    expect(groups[1].conversations.map((c) => c.id)).toEqual(['yesterday']);
    expect(groups[2].conversations.map((c) => c.id)).toEqual(['this-week']);
    expect(groups[3].conversations.map((c) => c.id)).toEqual(['this-month']);
    expect(groups[4].conversations.map((c) => c.id)).toEqual(['older']);
  });

  it('hides empty groups', () => {
    vi.setSystemTime(new Date(2026, 5, 6, 14, 30, 0));
    const convs: Conversation[] = [
      makeConv('today', 'Today conv', new Date(2026, 5, 6, 10, 0, 0)),
      makeConv('older', 'Older conv', new Date(2026, 4, 15, 6, 0, 0)),
    ];
    const groups = groupConversationsByDate(convs);
    expect(groups.map((g) => g.key)).toEqual(['today', 'older']);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Older']);
  });

  it('places invalid dates into Older', () => {
    vi.setSystemTime(new Date(2026, 5, 6, 14, 30, 0));
    const convs: Conversation[] = [{ id: 'bad', title: 'Bad date', updatedAt: 'not-a-date' }];
    const groups = groupConversationsByDate(convs);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('older');
    expect(groups[0].label).toBe('Older');
    expect(groups[0].conversations[0].id).toBe('bad');
  });
});

describe('formatConversationTime', () => {
  it('formats today as time', () => {
    const date = new Date(2026, 5, 6, 14, 30, 0);
    const result = formatConversationTime(date.toISOString(), 'today');
    expect(result).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/);
  });

  it('formats yesterday with label and time', () => {
    const date = new Date(2026, 5, 5, 9, 15, 0);
    const result = formatConversationTime(date.toISOString(), 'yesterday');
    expect(result).toMatch(/^Yesterday, \d{1,2}:\d{2}\s(AM|PM)$/);
  });

  it('formats this week as short weekday date', () => {
    const date = new Date(2026, 5, 3, 8, 0, 0);
    const result = formatConversationTime(date.toISOString(), 'thisWeek');
    expect(result).toMatch(/^\w{3}, \w{3} \d{1,2}$/);
  });

  it('formats this month as short weekday date', () => {
    const date = new Date(2026, 5, 1, 7, 0, 0);
    const result = formatConversationTime(date.toISOString(), 'thisMonth');
    expect(result).toMatch(/^\w{3}, \w{3} \d{1,2}$/);
  });

  it('formats older as full short date with year', () => {
    const date = new Date(2026, 4, 15, 6, 0, 0);
    const result = formatConversationTime(date.toISOString(), 'older');
    expect(result).toMatch(/^\w{3} \d{1,2}, \d{4}$/);
  });

  it('returns empty string for invalid date', () => {
    expect(formatConversationTime('invalid', 'today')).toBe('');
  });
});
