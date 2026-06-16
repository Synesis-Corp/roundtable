import type { Conversation } from '@chat/sdk';

export interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function groupConversationsByDate(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekAgoStart = new Date(todayStart);
  weekAgoStart.setDate(weekAgoStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: ConversationGroup[] = [
    { label: 'Today', conversations: [] },
    { label: 'Yesterday', conversations: [] },
    { label: 'This week', conversations: [] },
    { label: 'This month', conversations: [] },
    { label: 'Older', conversations: [] },
  ];

  const sorted = [...conversations].sort((a, b) => {
    const da = new Date(a.updatedAt).getTime();
    const db = new Date(b.updatedAt).getTime();
    return db - da;
  });

  for (const conv of sorted) {
    const d = new Date(conv.updatedAt);
    if (Number.isNaN(d.getTime())) {
      groups[4].conversations.push(conv);
      continue;
    }
    if (d >= todayStart) {
      groups[0].conversations.push(conv);
    } else if (d >= yesterdayStart) {
      groups[1].conversations.push(conv);
    } else if (d >= weekAgoStart) {
      groups[2].conversations.push(conv);
    } else if (d >= monthStart) {
      groups[3].conversations.push(conv);
    } else {
      groups[4].conversations.push(conv);
    }
  }

  return groups.filter((g) => g.conversations.length > 0);
}

export function formatConversationTime(dateStr: string, group: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  const shortDateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };
  const olderOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  switch (group) {
    case 'Today':
      return date.toLocaleTimeString('en-US', timeOptions);
    case 'Yesterday': {
      const time = date.toLocaleTimeString('en-US', timeOptions);
      return `Yesterday, ${time}`;
    }
    case 'This week':
    case 'This month':
      return date.toLocaleDateString('en-US', shortDateOptions);
    case 'Older':
      return date.toLocaleDateString('en-US', olderOptions);
    default:
      return date.toLocaleDateString('en-US', olderOptions);
  }
}
