/* ------------------------------------------------------------------ */
/*  Pure helpers + SVG icons extracted from ChatPage.                  */
/*  No React, no hooks, no side effects — testable in isolation.      */
/* ------------------------------------------------------------------ */

import type { CouncilInfo, CouncilVote } from '../types/chat';

export const NEW_CHAT_EVENT = 'roundtable:new-chat';

/** Time-of-day bucket; the caller maps it to a localized greeting via i18n. */
export function getGreeting(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Compose the welcome greeting text. Pure function — no hooks, no i18n
 * instance. The caller supplies the translated time-of-day prefix.
 *
 * Rules (Capability 9):
 * - `profileLoading === true` → just the prefix (no name, no decision yet).
 * - `incognito === true` → just the prefix (generic greeting in incognito).
 * - Otherwise → prefix + ", " + displayName (when displayName is non-empty).
 */
export function buildGreeting(
  prefix: string,
  displayName: string,
  profileLoading: boolean,
  incognito: boolean
): string {
  if (profileLoading || incognito) return prefix;
  return displayName ? `${prefix}, ${displayName}` : prefix;
}

export function getCouncilProviderColor(provider: string): string {
  if (provider === 'openai') return '#5cb08b';
  if (provider === 'anthropic') return '#cf9a5e';
  if (provider === 'deepseek') return '#5b91d6';
  if (provider === 'google') return '#9079ec';
  return '#7c6cf0';
}

export function getCouncilPreviewCount(
  models: Array<{ provider: string; capabilities?: string[] }>,
  connectedProviderCount: number
): number {
  const grouped = new Map<string, number>();

  for (const model of models) {
    if (model.capabilities && !model.capabilities.includes('text')) continue;
    grouped.set(model.provider, (grouped.get(model.provider) ?? 0) + 1);
  }

  const counted = Array.from(grouped.values()).reduce(
    (total, count) => total + Math.min(2, count),
    0
  );
  if (counted > 0) return counted;
  return connectedProviderCount > 0 ? connectedProviderCount * 2 : 0;
}

export function mapPersistedCouncilInfo(message: {
  councilTurn?: {
    winnerModelId: string;
    tallyFor: number;
    tallyTotal: number;
    consensus: boolean;
    answer: string;
    confidence?: string | null;
    voices: Array<{
      modelId: string;
      provider: string;
      displayName: string;
      approachLabel: string;
      angle?: string | null;
      vote: string;
      proposalText?: string | null;
      sources?: unknown;
      debateText?: string | null;
      voteReason?: string | null;
      voteImprovement?: string | null;
      confidence?: string | null;
      risk?: string | null;
      reasoning?: string | null;
    }>;
  } | null;
}): CouncilInfo | undefined {
  if (!message.councilTurn) return undefined;

  const voices = message.councilTurn.voices ?? [];

  const safeSources = (
    raw: unknown
  ): Array<{ title: string; url: string; snippet: string }> | undefined => {
    if (!Array.isArray(raw)) return undefined;
    return raw.filter(
      (item): item is { title: string; url: string; snippet: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).title === 'string' &&
        typeof (item as Record<string, unknown>).url === 'string' &&
        typeof (item as Record<string, unknown>).snippet === 'string'
    );
  };

  const safeConfidence = (raw: unknown): CouncilVote['confidence'] => {
    if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
    return undefined;
  };

  return {
    members: voices.map((voice) => ({
      modelId: voice.modelId,
      provider: voice.provider,
      displayName: voice.displayName,
      color: getCouncilProviderColor(voice.provider),
    })),
    winnerModelId: message.councilTurn.winnerModelId,
    tally: {
      for: message.councilTurn.tallyFor,
      total: message.councilTurn.tallyTotal,
    },
    consensus: message.councilTurn.consensus,
    confidence: safeConfidence(message.councilTurn.confidence),
    votes: voices.map((voice) => ({
      modelId: voice.modelId,
      provider: voice.provider,
      displayName: voice.displayName,
      approachLabel: voice.approachLabel,
      angle: voice.angle ?? undefined,
      vote: (['pending', 'for', 'changed', 'against'].includes(voice.vote)
        ? voice.vote
        : 'pending') as CouncilVote['vote'],
      isWinner: voice.modelId === message.councilTurn?.winnerModelId,
      proposalText: voice.proposalText ?? undefined,
      sources: safeSources(voice.sources),
      debateText: voice.debateText ?? undefined,
      voteReason: voice.voteReason ?? undefined,
      voteImprovement: voice.voteImprovement ?? undefined,
      confidence: safeConfidence(voice.confidence),
      risk: voice.risk ?? undefined,
      reasoning: voice.reasoning ?? undefined,
    })),
    answer: message.councilTurn.answer,
    plannedRounds: 3,
    currentRound: 3,
    currentRoundKind: 'synthesis',
    status: 'done',
  };
}

/* ------------------------------------------------------------------ */
/*  SVG icon helpers (only used by QuickActions)                       */
/* ------------------------------------------------------------------ */

function IconPencil({ className = 'w-[16px] h-[16px]' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconSearch({ className = 'w-[16px] h-[16px]' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function IconBulb({ className = 'w-[16px] h-[16px]' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick actions (per-task prompts for the single-model empty state)  */
/* ------------------------------------------------------------------ */

export interface QuickAction {
  icon: React.ReactNode;
  /** i18n key under `chat.quickActions.*` for the visible label. */
  labelKey: 'chat.quickActions.write' | 'chat.quickActions.search' | 'chat.quickActions.ideas';
  /** Prompt text key injected into the composer when the action is picked. */
  prefixKey:
    | 'chat.quickActionPrefixes.write'
    | 'chat.quickActionPrefixes.search'
    | 'chat.quickActionPrefixes.ideas';
  /** Token name applied to the icon color + tinted container. */
  iconColorToken: '--m-blue' | '--m-green' | '--m-rose';
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: <IconPencil />,
    labelKey: 'chat.quickActions.write',
    prefixKey: 'chat.quickActionPrefixes.write',
    iconColorToken: '--m-blue',
  },
  {
    icon: <IconSearch />,
    labelKey: 'chat.quickActions.search',
    prefixKey: 'chat.quickActionPrefixes.search',
    iconColorToken: '--m-green',
  },
  {
    icon: <IconBulb />,
    labelKey: 'chat.quickActions.ideas',
    prefixKey: 'chat.quickActionPrefixes.ideas',
    // Ideas uses --m-rose (NOT --m-amber — amber is overloaded: incognito,
    // Anthropic provider, council medium-confidence, admin).
    iconColorToken: '--m-rose',
  },
];
