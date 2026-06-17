import type { Conversation } from '@chat/sdk';
import i18n from '../i18n';

export interface ConversationGroup {
  key: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';
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
    { key: 'today', label: i18n.t('shell.history.today'), conversations: [] },
    { key: 'yesterday', label: i18n.t('shell.history.yesterday'), conversations: [] },
    { key: 'thisWeek', label: i18n.t('shell.history.thisWeek'), conversations: [] },
    { key: 'thisMonth', label: i18n.t('shell.history.thisMonth'), conversations: [] },
    { key: 'older', label: i18n.t('shell.history.older'), conversations: [] },
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

export function formatConversationTime(dateStr: string, groupKey: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';

  const locale = i18n.language === 'es' ? 'es-ES' : 'en-US';
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: i18n.language !== 'es',
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

  switch (groupKey) {
    case 'today':
      return date.toLocaleTimeString(locale, timeOptions);
    case 'yesterday': {
      const time = date.toLocaleTimeString(locale, timeOptions);
      return `${i18n.t('shell.history.yesterday')}, ${time}`;
    }
    case 'thisWeek':
    case 'thisMonth':
      return date.toLocaleDateString(locale, shortDateOptions);
    case 'older':
      return date.toLocaleDateString(locale, olderOptions);
    default:
      return date.toLocaleDateString(locale, olderOptions);
  }
}
