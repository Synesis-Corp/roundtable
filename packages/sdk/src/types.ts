import type { ToolSet as AiToolSet } from 'ai';
import type { ZodType } from 'zod';

// Re-export the AI SDK's ToolSet so the SDK package remains the single
// source of truth for cross-package contracts. Consumers (apps/api,
// packages/providers) get the actual `ToolSet<...>` type and can pass
// tool definitions directly to `streamText`/`generateText` without casts.
export type ToolSet = AiToolSet;

export type Modality = 'text' | 'image' | 'file' | 'audio' | 'pdf';

export type Feature = 'reasoning' | 'tool-use' | 'structured-output' | 'vision' | 'pdf-input';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: Modality;
  url?: string;
  base64?: string;
  mimeType?: string;
  name?: string;
  /**
   * Server-extracted text for PDF attachments, used as the fallback payload
   * when the target model does not support native PDF input. Populated by
   * `apps/api/src/lib/pdf-convert.ts` at upload time. Capped at 50,000 chars.
   */
  extractedText?: string;
  /** Total page count of the PDF, when available. */
  pageCount?: number;
}

export interface ChatRequest {
  messages: Message[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  modalities?: Modality[];
  effort?: string;
  variant?: string;
  variantOptions?: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  /** Reasoning/thinking trace, when the provider exposes one. */
  reasoning?: string;
}

/** Result of a structured-output generation (native `response_format`/JSON mode). */
export interface StructuredResponse<T> {
  object: T;
  model: string;
  provider: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface ChatChunk {
  token: string;
  /** Reasoning/thinking delta, when the model streams a chain-of-thought. */
  reasoning?: string;
  /** Emitted when the model invokes a tool. Carries the tool name and parsed args. */
  toolCall?: { name: string; args: unknown };
  /** Emitted when a tool's execute function returns. Carries the tool name and result. */
  toolResult?: { name: string; result: unknown };
  model: string;
  provider: string;
  isFinished: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ModelCapability {
  modelId: string;
  provider: string;
  modalities: Modality[];
  features: Feature[];
  contextWindow?: number;
}

export interface ProviderPlugin {
  id: string;
  name: string;
  getCapabilities(): ModelCapability[];
  chat(
    request: ChatRequest,
    apiKey: string,
    signal?: AbortSignal,
    tools?: ToolSet
  ): Promise<ChatResponse>;
  streamChat(
    request: ChatRequest,
    apiKey: string,
    signal?: AbortSignal,
    tools?: ToolSet
  ): AsyncIterable<ChatChunk>;
  /**
   * Generate a structured object validated against `schema`, using the model's
   * native structured-output mode (the AI SDK's `generateObject`). Eliminates
   * brittle text parsing where the caller needs typed fields back.
   */
  chatStructured<T>(
    request: ChatRequest,
    schema: ZodType<T>,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<StructuredResponse<T>>;
}

export interface UserPreference {
  forceModel?: string;
  forceProvider?: string;
  multiMode?: boolean;
  incognito?: boolean;
  temperature?: number;
  effort?: string;
  councilMembers?: string[]; // ["provider:modelId", ...]
}

export interface RoutingDecision {
  primary: ModelCapability;
  fallbacks: ModelCapability[];
  multiModels?: ModelCapability[];
}

// ── API response contracts shared between backend and frontend ──

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  capabilities: string[];
}

export interface AvailableProvider {
  id: string;
  name: string;
  npm: string;
  doc: string;
  env: string[];
  modelCount: number;
  popular: boolean;
  models: ModelInfo[];
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages?: Array<{ content: string; role: string; providerId?: string }>;
}

export interface UserProvider {
  id: string;
  providerId: string;
  maskedKey: string;
  isActive: boolean;
  options?: string;
}

// ── Council / Consejo deliberativo ──

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
  tier?: 'strong' | 'light';
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
  confidence?: 'high' | 'medium' | 'low';
}

// ── Stream events (SSE protocol) ──

export type StreamEvent =
  // --- común ---
  | { type: 'turn.start'; mode: 'single' | 'council'; conversationId: string }
  // --- modo único ---
  | { type: 'message.delta'; textDelta: string }
  | {
      type: 'message.done';
      model: { provider: string; modelId: string };
      usage?: { tokensUsed: number; inputTokens?: number; outputTokens?: number };
    }
  // --- consejo ---
  | { type: 'council.start'; members: CouncilMember[]; plannedRounds: number }
  | { type: 'round.start'; round: number; kind: 'proposals' | 'debate' | 'vote' }
  | { type: 'voice.delta'; modelId: string; round: number; textDelta: string }
  | {
      type: 'voice.proposal';
      modelId: string;
      round: number;
      approachLabel: string;
      proposalText?: string;
      status: 'complete';
      angle?: string;
      sources?: Array<{ title: string; url: string; snippet: string }>;
      reasoning?: string;
    }
  | { type: 'voice.reasoning'; modelId: string; reasoning: string }
  | { type: 'round.end'; round: number }
  | {
      type: 'vote.cast';
      modelId: string;
      vote: 'for' | 'changed' | 'against';
      targetModelId: string;
      confidence?: 'high' | 'medium' | 'low';
      risk?: string;
    }
  | {
      type: 'council.decision';
      winnerModelId: string;
      tally: { for: number; total: number };
      consensus: boolean;
      confidence?: 'high' | 'medium' | 'low';
    }
  | { type: 'council.answer.delta'; textDelta: string }
  | { type: 'council.answer.done' }
  // --- errores / fallback ---
  | {
      type: 'voice.error';
      modelId: string;
      code: string;
      message: string;
      fallbackModelId?: string;
    }
  | { type: 'turn.error'; code: string; message: string }
  | { type: 'turn.done' }
  // --- tool calling (any provider, any mode) ---
  | { type: 'tool.call'; name: string; args: unknown }
  | { type: 'tool.result'; name: string; result: unknown };
