import type { Message } from '@chat/sdk';
import type { EffortVariant, EffortSpec } from '@chat/router';

export type { EffortVariant, EffortSpec };

/** A single tool invocation during the assistant's response. The model may
 *  have invoked multiple tools in a single turn (e.g. several web searches). */
export interface ToolCallRecord {
  name: string;
  args?: unknown;
  result?: unknown;
}

/** UI-extended message: SDK base + id + provider metadata + error flag. */
export interface ChatMessage extends Message {
  id: string;
  provider?: string;
  model?: string;
  isError?: boolean;
  councilInfo?: CouncilInfo;
  /** Assistant reasoning/thinking trace, when the model exposes one. */
  reasoning?: string;
  /** Tool invocations the assistant made during this response (e.g. web_search).
   *  Empty/undefined when no tools were called. The UI renders a "searched
   *  the web" chip based on the length of this array. */
  toolCalls?: ToolCallRecord[];
}

export interface MultiInfo {
  plan?: string[];
  contributors?: Array<{ task: string; provider: string; model: string }>;
}

export interface CouncilMember {
  modelId: string;
  provider: string;
  displayName: string;
  color: string;
  tier?: 'strong' | 'light';
}

export interface CouncilVote {
  modelId: string;
  provider: string;
  displayName: string;
  approachLabel: string;
  vote: 'pending' | 'for' | 'changed' | 'against';
  isWinner: boolean;
  proposalText?: string;
  /** Round 2 — this model's comparative evaluation of all proposals. */
  debateText?: string;
  /** Round 3 — why this model voted the way it did. */
  voteReason?: string;
  /** Round 3 — the improvement this model wants in the final answer. */
  voteImprovement?: string;
  tier?: 'strong' | 'light';
  /** Assigned perspective for Round 1. */
  angle?: string;
  /** Verified web_search sources cited in the proposal. */
  sources?: Array<{ title: string; url: string; snippet: string }>;
  /** Round 3 — confidence level of the vote. */
  confidence?: 'high' | 'medium' | 'low';
  /** Round 3 — main risk of the chosen base. */
  risk?: string;
  /** Round 1 — captured reasoning/thinking trace. */
  reasoning?: string;
}

export interface CouncilInfo {
  members: CouncilMember[];
  winnerModelId: string;
  tally: { for: number; total: number };
  consensus: boolean;
  votes: CouncilVote[];
  answer: string;
  plannedRounds?: number;
  currentRound?: number;
  currentRoundKind?: 'proposals' | 'debate' | 'vote' | 'synthesis';
  status?: 'running' | 'done' | 'error';
  /** Aggregated council confidence for the final decision. */
  confidence?: 'high' | 'medium' | 'low';
}

/** A selectable model in the model picker (subset of useModels' ModelInfo). */
export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities?: string[];
}
