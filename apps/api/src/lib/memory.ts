export type MemoryId = string;
export type MemoryUserId = string;
export type MemoryTag = string;
export type MemoryTimestamp = Date;

export type MemorySource = { type: 'conversation'; conversationId: string } | { type: 'manual' };

export interface MemoryRecord {
  id: MemoryId;
  userId: MemoryUserId;
  content: string;
  source: MemorySource | null;
  tags: readonly MemoryTag[];
  createdAt: MemoryTimestamp;
  updatedAt: MemoryTimestamp;
}

export interface CreateMemoryRecord {
  userId: MemoryUserId;
  content: string;
  source: MemorySource | null;
  tags: readonly MemoryTag[];
}

/**
 * Persistence seam for a future Prisma adapter. The core owns normalization,
 * deduplication, ranking, budgets, and user isolation; an adapter only maps
 * these operations to the generated database client.
 */
export interface MemoryRepository {
  findDedupCandidates(userId: MemoryUserId, limit: number): Promise<readonly MemoryRecord[]>;
  findRecallCandidates(userId: MemoryUserId, limit: number): Promise<readonly MemoryRecord[]>;
  create(input: CreateMemoryRecord): Promise<MemoryRecord>;
}

export interface StoreMemoryInput {
  userId: MemoryUserId;
  content: string;
  source?: MemorySource | null;
  tags?: readonly string[];
}

export type StoreMemoryResult =
  | { status: 'stored'; memory: MemoryRecord }
  | { status: 'duplicate'; memory: MemoryRecord };

export interface RetrieveMemoriesInput {
  userId: MemoryUserId;
  query?: string;
  tokenBudget?: number;
  maxItems?: number;
  candidateLimit?: number;
}

const DEDUP_CANDIDATE_LIMIT = 1_000;
const DEFAULT_RECALL_CANDIDATE_LIMIT = 100;
const MAX_RECALL_CANDIDATE_LIMIT = 200;
const DEFAULT_RECALL_ITEMS = 8;
const MAX_RECALL_ITEMS = 20;
const DEFAULT_TOKEN_BUDGET = 256;
const MAX_TOKEN_BUDGET = 2_048;
const MAX_TAGS = 20;
const MEMORY_FRAMING_TOKEN_ESTIMATE = 4;

const STOP_WORDS = new Set([
  'a',
  'al',
  'and',
  'con',
  'de',
  'del',
  'el',
  'en',
  'es',
  'esta',
  'este',
  'is',
  'la',
  'las',
  'los',
  'mi',
  'my',
  'of',
  'para',
  'por',
  'que',
  'the',
  'to',
  'un',
  'una',
  'y',
]);

export function normalizeMemoryContent(content: string): string {
  const compact = compactWhitespace(content).toLowerCase();
  let normalized = '';

  for (const character of compact) {
    normalized += isTrivialSeparator(character) ? ' ' : character;
  }

  return compactWhitespace(normalized);
}

export function estimateMemoryTokens(content: string): number {
  const characterCount = Array.from(content).length;
  return Math.ceil(characterCount / 3) + MEMORY_FRAMING_TOKEN_ESTIMATE;
}

export async function storeMemory(
  repository: MemoryRepository,
  input: StoreMemoryInput
): Promise<StoreMemoryResult> {
  const userId = requireNonEmpty(input.userId, 'Memory userId cannot be empty');
  const content = compactWhitespace(input.content);
  const normalizedContent = normalizeMemoryContent(content);

  if (!normalizedContent) {
    throw new RangeError('Memory content cannot be empty');
  }

  const candidates = await repository.findDedupCandidates(userId, DEDUP_CANDIDATE_LIMIT);
  const duplicate = candidates
    .slice(0, DEDUP_CANDIDATE_LIMIT)
    .find(
      (candidate) =>
        candidate.userId === userId &&
        normalizeMemoryContent(candidate.content) === normalizedContent
    );

  if (duplicate) {
    return { status: 'duplicate', memory: duplicate };
  }

  const memory = await repository.create({
    userId,
    content,
    source: input.source ?? null,
    tags: normalizeTags(input.tags ?? []),
  });

  return { status: 'stored', memory };
}

export async function retrieveMemories(
  repository: MemoryRepository,
  input: RetrieveMemoriesInput
): Promise<MemoryRecord[]> {
  const userId = requireNonEmpty(input.userId, 'Memory userId cannot be empty');
  const tokenBudget = clampInteger(input.tokenBudget, DEFAULT_TOKEN_BUDGET, MAX_TOKEN_BUDGET);
  const maxItems = clampInteger(input.maxItems, DEFAULT_RECALL_ITEMS, MAX_RECALL_ITEMS);

  if (tokenBudget === 0 || maxItems === 0) {
    return [];
  }

  const candidateLimit = clampInteger(
    input.candidateLimit,
    DEFAULT_RECALL_CANDIDATE_LIMIT,
    MAX_RECALL_CANDIDATE_LIMIT
  );
  const candidates = await repository.findRecallCandidates(userId, candidateLimit);
  const queryTerms = keywordTerms(input.query ?? '');
  const ranked = candidates
    .slice(0, candidateLimit)
    .filter((candidate) => candidate.userId === userId)
    .map((memory) => ({ memory, keywordScore: scoreKeywords(memory, queryTerms) }))
    .sort(compareRankedMemories);

  const selected: MemoryRecord[] = [];
  let usedTokens = 0;

  for (const candidate of ranked) {
    if (selected.length >= maxItems) break;

    const estimatedTokens = estimateMemoryTokens(candidate.memory.content);
    if (usedTokens + estimatedTokens > tokenBudget) continue;

    selected.push(candidate.memory);
    usedTokens += estimatedTokens;
  }

  return selected;
}

function compactWhitespace(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function isTrivialSeparator(character: string): boolean {
  if (character === '+' || character === '#') return false;
  return /[\p{P}\p{S}]/u.test(character);
}

function normalizeTags(tags: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const clean = compactWhitespace(tag).toLowerCase();
    if (!clean || seen.has(clean)) continue;

    seen.add(clean);
    normalized.push(clean);
    if (normalized.length === MAX_TAGS) break;
  }

  return normalized;
}

function keywordTerms(value: string): Set<string> {
  const terms = normalizeMemoryContent(value)
    .split(' ')
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
  return new Set(terms);
}

function scoreKeywords(memory: MemoryRecord, queryTerms: ReadonlySet<string>): number {
  if (queryTerms.size === 0) return 0;

  const contentTerms = keywordTerms(memory.content);
  const tagTerms = new Set(memory.tags.flatMap((tag) => [...keywordTerms(tag)]));
  let score = 0;

  for (const term of queryTerms) {
    if (contentTerms.has(term)) score += 2;
    if (tagTerms.has(term)) score += 1;
  }

  return score;
}

function compareRankedMemories(
  left: { memory: MemoryRecord; keywordScore: number },
  right: { memory: MemoryRecord; keywordScore: number }
): number {
  if (left.keywordScore !== right.keywordScore) {
    return right.keywordScore - left.keywordScore;
  }

  const updatedDifference = compareTimestampsDescending(
    left.memory.updatedAt,
    right.memory.updatedAt
  );
  if (updatedDifference !== 0) return updatedDifference;

  const createdDifference = compareTimestampsDescending(
    left.memory.createdAt,
    right.memory.createdAt
  );
  if (createdDifference !== 0) return createdDifference;

  if (left.memory.id < right.memory.id) return -1;
  if (left.memory.id > right.memory.id) return 1;
  return 0;
}

function timestampValue(timestamp: MemoryTimestamp): number {
  const value = timestamp.getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function compareTimestampsDescending(left: MemoryTimestamp, right: MemoryTimestamp): number {
  const leftValue = timestampValue(left);
  const rightValue = timestampValue(right);
  if (leftValue === rightValue) return 0;
  return rightValue > leftValue ? 1 : -1;
}

function clampInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 0), maximum);
}

function requireNonEmpty(value: string, message: string): string {
  const compact = compactWhitespace(value);
  if (!compact) throw new RangeError(message);
  return compact;
}
