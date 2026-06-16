import { z } from 'zod';
import type { Message, ProviderPlugin } from '@chat/sdk';
import { isUseCaseEligible } from '@chat/router';
import { storeMemory, type MemoryRepository } from './memory';

/**
 * Schema for the memory extractor's structured output. Keeping it narrow makes
 * parsing reliable and avoids bloating the context window with long memories.
 */
export const ExtractedMemoriesSchema = z.object({
  memories: z
    .array(z.string().trim().min(1).max(500))
    .max(5)
    .describe(
      'Lista corta de hechos atómicos sobre el usuario: preferencias, proyectos, contexto personal/profesional o restricciones. Vacía si no hay nada digno de recordar.'
    ),
});

export type ExtractedMemories = z.infer<typeof ExtractedMemoriesSchema>;

export interface ExtractMemoriesInput {
  provider: ProviderPlugin;
  modelId: string;
  apiKey: string;
  userId: string;
  conversationId?: string;
  messages: readonly Message[];
  signal?: AbortSignal;
}

export interface MemoryExtractorLogger {
  warn(bindings: { err: unknown; modelId?: string }, message: string): void;
  info(bindings: { userId: string; count: number }, message: string): void;
}

const MAX_CONTENT_LENGTH = 1_200;

/**
 * Extracts atomic memory facts from the last user/assistant exchange.
 *
 * Best-effort: any failure returns an empty array and the caller continues.
 * The call is meant to be fire-and-forget after the assistant response has
 * already been sent/persisted, so it never blocks the chat path.
 */
export async function extractMemoriesFromExchange(
  input: ExtractMemoriesInput
): Promise<ExtractedMemories> {
  // The chat turn's model is reused for extraction; if the capability matrix
  // says it can't do memory-extraction (e.g. an embedding model), skip the
  // doomed call entirely instead of burning a request that will fail.
  if (!isUseCaseEligible(input.provider.id, input.modelId, 'memory-extraction')) {
    return { memories: [] };
  }

  const exchange = buildExchangeSnapshot(input.messages);
  if (!exchange) return { memories: [] };

  const prompt = buildExtractionPrompt(exchange);

  try {
    const structured = await input.provider.chatStructured(
      {
        messages: [{ role: 'user', content: prompt }],
        model: input.modelId,
        temperature: 0.2,
        maxTokens: 800,
      },
      ExtractedMemoriesSchema,
      input.apiKey,
      input.signal
    );

    return sanitizeExtractedMemories(structured.object);
  } catch {
    // Fallback to plain text + JSON parse for providers/models without native
    // structured output.
    try {
      const response = await input.provider.chat(
        {
          messages: [{ role: 'user', content: prompt }],
          model: input.modelId,
          temperature: 0.2,
          maxTokens: 800,
        },
        input.apiKey,
        input.signal
      );

      const parsed = parseMemoryJson(response.content);
      return sanitizeExtractedMemories(parsed);
    } catch {
      // Both attempts failed; degrade silently. Extraction must never break chat.
      return { memories: [] };
    }
  }
}

export interface PersistMemoriesInput {
  repository: MemoryRepository;
  userId: string;
  conversationId?: string;
  memories: readonly string[];
  logger: MemoryExtractorLogger;
}

/**
 * Persists extracted memories, swallowing duplicates and failures.
 */
export async function persistExtractedMemories(input: PersistMemoriesInput): Promise<void> {
  if (input.memories.length === 0) return;

  let stored = 0;
  for (const content of input.memories) {
    try {
      await storeMemory(input.repository, {
        userId: input.userId,
        content,
        source: input.conversationId
          ? { type: 'conversation', conversationId: input.conversationId }
          : { type: 'manual' },
      });
      stored++;
    } catch (err) {
      // Duplicate is expected and harmless; other errors are logged but not thrown.
      if (!(err instanceof Error && err.message.includes('duplicate'))) {
        input.logger.warn({ err }, 'memory extraction: persist failed');
      }
    }
  }

  input.logger.info({ userId: input.userId, count: stored }, 'memories extracted');
}

function buildExchangeSnapshot(messages: readonly Message[]): string | null {
  const lastUser = findLastMessage(messages, 'user');
  const lastAssistant = findLastMessage(messages, 'assistant');

  if (!lastUser) return null;

  const parts: string[] = [];
  parts.push(`Usuario: ${truncate(lastUser.content, MAX_CONTENT_LENGTH)}`);

  if (lastAssistant) {
    parts.push(`Asistente: ${truncate(lastAssistant.content, MAX_CONTENT_LENGTH)}`);
  }

  return parts.join('\n\n');
}

function findLastMessage(messages: readonly Message[], role: Message['role']): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === role) return message;
  }
  return undefined;
}

function buildExtractionPrompt(exchange: string): string {
  return [
    'Eres un extractor de memoria a largo plazo. Analiza este intercambio de chat y extrae hechos concretos sobre el usuario que serían útiles recordar en conversaciones futuras.',
    '',
    'Reglas:',
    '- Extrae solo datos del usuario: preferencias, proyectos, contexto personal/profesional, restricciones, herramientas frecuentes.',
    '- Cada hecho debe ser atómico (una sola idea) y conciso (máximo ~200 caracteres).',
    '- NO incluyas información sensible como contraseñas, tokens, números de tarjeta o datos de salud detallados.',
    '- NO repitas hechos obvios ("el usuario está chateando").',
    '- Si no hay nada digno de recordar, devuelve un array vacío.',
    '- Responde SOLO con JSON válido de esta forma: {"memories": ["hecho 1", "hecho 2"]}',
    '',
    exchange,
  ].join('\n');
}

function sanitizeExtractedMemories(parsed: unknown): ExtractedMemories {
  const safe = ExtractedMemoriesSchema.safeParse(parsed);
  if (!safe.success) return { memories: [] };
  return safe.data;
}

function parseMemoryJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trim()}…`;
}
