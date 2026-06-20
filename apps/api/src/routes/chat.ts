import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/db';
import { route } from '@chat/router';
import type { ChatRequest, Message, ProviderPlugin } from '@chat/sdk';
import { ensureValidMessages } from '../lib/validate-messages';
import { selectConfiguredProvider, selectAllConfiguredProviders } from '../lib/select-provider';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { getModelEffortSpec } from '../services/model-registry';
import { uploadFiles, parseMultipartBody } from '../lib/multipart';
import { generateConversationTitle } from '../lib/title';
import { streamHub, type StreamSession } from '../lib/stream-hub';
import type { RuntimeProviderCredential } from '../lib/provider-credentials';
import { buildChatTools } from '../lib/chat-tools';
import { getDefaultSandboxRunner } from '../lib/wasi-sandbox-runner';
import { recallMemoriesForChat, withTemporalContext } from '../lib/context-message';
import { PrismaMemoryRepository, type PrismaMemoryClient } from '../lib/memory-prisma';
import { recordUsageEvent } from '../lib/usage-events';
import { extractMemoriesFromExchange, persistExtractedMemories } from '../lib/memory-extractor';

const router = Router();

/**
 * Defense-in-depth for Post-deploy #1: the router refuses to route to a model
 * that isn't chat-capable and throws a recognizable error. We convert that
 * into a 422 with a clear user-facing message instead of letting it bubble as
 * a generic 500 or the opaque upstream "v1/completions" error the user would
 * otherwise see. Caller picks the language (English for now; i18n pending).
 */
export function isNoChatModelsError(err: unknown): boolean {
  return err instanceof Error && /No capable chat models available/i.test(err.message);
}

/**
 * Post-deploy #1 v2: the upstream provider returns 404 with the message
 * "This is not a chat model and thus not supported in the v1/chat/completions
 * endpoint. Did you mean to use v1/completions?" when the router picks a model
 * the provider doesn't actually have (a phantom / "próximamente" model from
 * Models.dev that the registry knows about but OpenAI hasn't released yet,
 * e.g. `gpt-5.2-pro`).
 *
 * The router's curated `modelExclusions` covers the known phantoms, but new
 * ones can appear at any time. We detect the upstream 404 + that message
 * pattern and trigger an automatic retry with the next ranked candidate.
 * This makes Auto robust without needing the exclusion list to be exhaustive.
 *
 * Other patterns covered (defense-in-depth): the upstream may return the same
 * shape for actual completion-only models that slipped past the registry
 * (e.g. a brand-new instruct variant). The same retry path handles them.
 */
export function isUpstreamModelNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /not a chat model/i.test(msg) ||
    /model .* does not exist/i.test(msg) ||
    /model not found/i.test(msg) ||
    /unknown model/i.test(msg) ||
    /invalid model/i.test(msg)
  );
}

/**
 * Auto-fallback trigger for rate-limit / quota errors (change
 * `2026-06-20-auto-rate-limit-fallback`).
 *
 * The 404 / "not a chat model" trigger above only fires for phantoms the
 * registry has never seen. A different class of failure — a real model whose
 * plan ran out, or an upstream throttling us — surfaces as a quota or
 * 429 error. Today the loop terminates with `!finishedOk` and the user sees
 * the raw AI SDK wrapper "Failed after 3 attempts. Last error: You exceeded
 * your current quota…". This classifier catches both the direct provider
 * message and the SDK wrapper so the swap loop can move to the next
 * candidate silently.
 *
 * Conservative regex: requires at least one *strong* token (`quota`,
 * `RESOURCE_EXHAUSTED`, `429`, `payment required`, `Plan not active`) or
 * one of the well-known auxiliary tokens (`rate_limit_exceeded`,
 * `free_tier`, `usage limit`, `TPM`, `RPM`). Bare "rate limit" mentions in
 * passing messages are rejected — see the
 * `'rejects incidental "rate limit" mention without a strong token'` test.
 *
 * Operates on `err.message` substring (case-insensitive), so it matches the
 * full AI SDK wrapper text (`"Failed after N attempts. Last error: …"`).
 *
 * @param err - The error thrown by `provider.streamChat()` (sync or async)
 * @returns `true` if the error is a quota / rate-limit error that should
 *   trigger a silent swap to the next fallback candidate.
 */
export function isRateLimitOrQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /quota|RESOURCE_EXHAUSTED|429|payment required|Plan not active/i.test(msg) ||
    /rate_limit_exceeded|rate limit exceeded/i.test(msg) ||
    /free.?tier/i.test(msg) ||
    /usage limit/i.test(msg) ||
    /\bTPM\b/.test(msg) ||
    /\bRPM\b/.test(msg)
  );
}

/** Tag used in the SSE error envelope (and `log.warn`) to tell the frontend
 *  which i18n key to render. `'other'` is the legacy default for errors that
 *  don't match any classifier (5xx, timeout, auth, etc.). */
export type ChatErrorKind = 'quota' | 'rate-limit' | 'not-found' | 'other';

/** Classify an error into the ChatErrorKind the frontend keys off of. Order
 *  matters: the rate-limit/quota check runs first because 404 patterns can
 *  never match a quota message, but the reverse is also safe — a "not a chat
 *  model" error is never going to mention "quota" or "RESOURCE_EXHAUSTED". */
export function classifyChatError(err: unknown): ChatErrorKind {
  if (isRateLimitOrQuotaError(err)) return 'quota';
  if (isUpstreamModelNotFoundError(err)) return 'not-found';
  return 'other';
}

/** Cap of automatic model-fallback retries per request. Hard-coded to keep
 *  the failure-mode obvious in logs; if you need more, think about why the
 *  exclusion list isn't catching the bad models. */
export const MAX_MODEL_RETRIES = 3;

function normalizeIncognitoPreference(
  preferences: unknown
):
  | { ok: true; preferences: Record<string, unknown>; incognito: boolean }
  | { ok: false; error: string } {
  if (preferences === undefined || preferences === null) {
    return { ok: true, preferences: {}, incognito: false };
  }
  if (typeof preferences !== 'object' || Array.isArray(preferences)) {
    return { ok: false, error: "'preferences' must be an object" };
  }

  const normalized = preferences as Record<string, unknown>;
  if (normalized.incognito !== undefined && typeof normalized.incognito !== 'boolean') {
    return { ok: false, error: "'preferences.incognito' must be a boolean" };
  }

  return {
    ok: true,
    preferences: normalized,
    incognito: normalized.incognito === true,
  };
}

const memoryRepository = new PrismaMemoryRepository(prisma as unknown as PrismaMemoryClient);

interface ChatGenerationContext {
  session: StreamSession;
  provider: ProviderPlugin;
  credential: RuntimeProviderCredential;
  request: ChatRequest;
  messages: Message[];
  preferences: Record<string, unknown>;
  assistantMessageId?: string;
  userId: string;
  modelId: string;
  conversationId?: string;
  streamId: string;
  incognito: boolean;
  isNewConversation: boolean;
  userMessageContent: string;
  startTime: number;
  log: AuthenticatedRequest['log'];
  /**
   * Additional ranked candidates to try if the primary model fails with an
   * upstream 404 / "not a chat model" / "model not found" error (Post-deploy
   * #1 v2, 2026-06-18). Each entry is the full provider + credential + model
   * already resolved up front, so the retry is a no-op for the database /
   * provider lookup.
   *
   * Empty array (the common case) = no fallback available. The retry loop in
   * `runChatGeneration` walks these in order (capped at `MAX_MODEL_RETRIES`)
   * and only swaps while no chunk has been streamed to the user yet.
   */
  fallbackCandidates?: Array<{
    provider: ProviderPlugin;
    credential: RuntimeProviderCredential;
    modelId: string;
  }>;
}

/**
 * Runs a single-provider streaming generation detached from any HTTP request,
 * publishing every chunk to the StreamHub session. It is fire-and-forget: it
 * NEVER throws — every exit (success, provider error, abort) flows through the
 * hub and ends with streamHub.finish so subscribers are released. Partial
 * output is flushed to the DB throttled so nothing is lost if the work is cut
 * short. (P.1 + P.2)
 */
async function runChatGeneration(ctx: ChatGenerationContext): Promise<void> {
  const {
    session,
    provider,
    credential,
    request,
    messages,
    preferences,
    assistantMessageId,
    userId,
    modelId,
    conversationId,
    streamId,
    incognito,
    isNewConversation,
    userMessageContent,
    startTime,
    log,
  } = ctx;
  const signal = session.abort.signal;

  let fullContent = '';
  let fullReasoning = '';
  // Accumulated tool invocations (e.g. web_search). Each tool.result is paired
  // back to the most recent call with the same name (the AI SDK doesn't echo a
  // toolCallId in the SSE event today — same pairing the frontend uses).
  const toolCalls: Array<{ name: string; args?: unknown; result?: unknown }> = [];
  let tokenCount = 0;
  let streamUsage:
    | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    | undefined;
  let usageProviderId = provider.id;
  let usageModelId = modelId;
  let lastFlushAt = Date.now();

  const flushPartial = async () => {
    if (incognito || !assistantMessageId) return;
    try {
      await prisma.message.update({
        where: { id: assistantMessageId },
        data: {
          content: fullContent,
          ...(fullReasoning ? { reasoning: fullReasoning } : {}),
          ...(toolCalls.length ? { toolCalls: toolCalls as object } : {}),
        },
      });
      lastFlushAt = Date.now();
    } catch (flushErr) {
      log.warn({ err: flushErr }, 'chat stream: partial flush failed');
    }
  };

  // Persistent streams expose their real conversation. Incognito streams use
  // an explicit ephemeral identifier that exists only inside StreamHub.
  streamHub.publish(
    session,
    incognito
      ? { type: 'stream.created', streamId, incognito: true }
      : { type: 'conversation.created', conversationId }
  );

  // Build the tools once per request and pass them to the provider. When the
  // provider yields tool-call/tool-result chunks, we publish them as dedicated
  // SSE events so the UI can render the "searched the web" chip. The cast
  // widens `Record<string, unknown>` to the SDK's ToolSet (Record<string,
  // Tool>); the runtime shape is identical.
  const tools = buildChatTools({
    sandboxRunner: getDefaultSandboxRunner(),
  }) as Parameters<ProviderPlugin['streamChat']>[3];

  // Post-deploy #1 v2 (2026-06-18): the upstream "not a chat model" / 404 from
  // a phantom model (e.g. gpt-5.2-pro — listed in Models.dev but not actually
  // released by OpenAI) surfaces while CONSUMING the async-generator stream,
  // NOT when streamChat() is called (invoking an async generator runs none of
  // its body). So the retry MUST wrap the `for await`, not just the call. We
  // attempt the primary first, then each pre-resolved fallback candidate, and
  // swap silently as long as nothing has been streamed to the user yet — a
  // clean swap with zero duplicated tokens. Once any chunk has been emitted we
  // never retry (we'd duplicate output); the error is surfaced as-is.
  const attempts = [{ provider, credential, modelId }, ...(ctx.fallbackCandidates ?? [])];
  const maxAttempts = Math.min(attempts.length, MAX_MODEL_RETRIES + 1);

  let streamed = false; // flips true the moment we receive any chunk
  let finishedOk = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = attempts[attempt]!;
    const isLastAttempt = attempt === maxAttempts - 1;
    // Record usage against whatever model actually ran (overwritten per chunk).
    usageProviderId = candidate.provider.id;
    usageModelId = candidate.modelId;

    let stream;
    try {
      // Re-point the request at the candidate model: providers route off
      // request.model (e.g. `client(request.model)`), so a fallback MUST
      // override it or it would just re-hit the same phantom model.
      stream = candidate.provider.streamChat(
        { ...request, model: candidate.modelId },
        candidate.credential.apiKey,
        signal,
        tools
      );
    } catch (streamErr) {
      // Constructing the generator threw synchronously (rare, but defensive):
      // same retry rules as an iteration error. Auto-fallback swap triggers:
      //   - isUpstreamModelNotFoundError (Post-deploy #1 v2): phantom / 404
      //   - isRateLimitOrQuotaError (2026-06-20-auto-rate-limit-fallback):
      //     primary ran out of quota or is being throttled upstream
      if (
        !streamed &&
        !isLastAttempt &&
        (isUpstreamModelNotFoundError(streamErr) || isRateLimitOrQuotaError(streamErr))
      ) {
        const errorKind = classifyChatError(streamErr);
        log.warn(
          {
            originalModel: candidate.modelId,
            fallbackModel: attempts[attempt + 1]!.modelId,
            attempt: attempt + 1,
            maxRetries: MAX_MODEL_RETRIES,
            errorKind,
          },
          'chat stream: model rejected by upstream on open; retrying with fallback'
        );
        continue;
      }
      log.error({ err: streamErr }, 'chat stream: failed to start');
      streamHub.publish(session, {
        error: streamErr instanceof Error ? streamErr.message : 'Failed to start stream',
        errorKind: classifyChatError(streamErr),
        errorProvider: candidate.provider.name,
        attemptsTried: attempt + 1,
      });
      streamHub.finish(session, 'error');
      return;
    }

    try {
      for await (const chunk of stream) {
        streamed = true;
        usageProviderId = chunk.provider;
        usageModelId = chunk.model;
        fullContent += chunk.token ?? '';
        fullReasoning += chunk.reasoning ?? '';
        if (chunk.token) tokenCount++;
        if (chunk.isFinished && chunk.usage) streamUsage = chunk.usage;
        if (chunk.toolCall) {
          toolCalls.push({ name: chunk.toolCall.name, args: chunk.toolCall.args });
          streamHub.publish(session, {
            type: 'tool.call',
            name: chunk.toolCall.name,
            args: chunk.toolCall.args,
          });
        } else if (chunk.toolResult) {
          const idx = toolCalls.map((c) => c.name).lastIndexOf(chunk.toolResult.name);
          if (idx === -1) {
            toolCalls.push({ name: chunk.toolResult.name, result: chunk.toolResult.result });
          } else {
            toolCalls[idx] = { ...toolCalls[idx]!, result: chunk.toolResult.result };
          }
          streamHub.publish(session, {
            type: 'tool.result',
            name: chunk.toolResult.name,
            result: chunk.toolResult.result,
          });
        } else {
          streamHub.publish(session, chunk);
        }
        if (chunk.isFinished) break;
        if (fullContent && Date.now() - lastFlushAt > 750) await flushPartial();
      }
      finishedOk = true;
      break;
    } catch (err) {
      // Explicit stop (abort): keep whatever was generated, end cleanly.
      if (signal.aborted) {
        log.info('chat stream: generation aborted');
        if (fullContent) await flushPartial();
        streamHub.finish(session, 'done');
        return;
      }
      // Post-deploy #1 v2: this is where the upstream 404 / "not a chat model"
      // actually surfaces. If nothing has streamed yet AND a fallback remains,
      // swap models silently and retry the loop. Auto-fallback (2026-06-20)
      // adds rate-limit / quota as a second swap trigger.
      if (
        !streamed &&
        !isLastAttempt &&
        (isUpstreamModelNotFoundError(err) || isRateLimitOrQuotaError(err))
      ) {
        const errorKind = classifyChatError(err);
        log.warn(
          {
            originalModel: candidate.modelId,
            fallbackModel: attempts[attempt + 1]!.modelId,
            attempt: attempt + 1,
            maxRetries: MAX_MODEL_RETRIES,
            errorKind,
          },
          'chat stream: model rejected by upstream; retrying with fallback'
        );
        continue;
      }
      log.error({ err }, 'chat stream error');
      if (fullContent) await flushPartial();
      streamHub.publish(session, {
        error: err instanceof Error ? err.message : 'Stream interrupted',
        errorKind: classifyChatError(err),
        errorProvider: candidate.provider.name,
        attemptsTried: attempt + 1,
      });
      streamHub.finish(session, 'error');
      return;
    }
  }

  // Unreachable in practice (the last attempt always returns via success or
  // the error path), but guard against a silent hang if every attempt was
  // skipped by the retry guard.
  if (!finishedOk) {
    streamHub.finish(session, 'error');
    return;
  }

  if (signal.aborted) {
    if (fullContent) await flushPartial();
    streamHub.finish(session, 'done');
    return;
  }

  const latencyMs = Date.now() - startTime;
  const estimatedOutputTokens = streamUsage?.outputTokens ?? Math.ceil(fullContent.length / 4);
  const estimatedInputTokens = streamUsage?.inputTokens;

  await recordUsageEvent(
    userId,
    'single',
    {
      provider: usageProviderId,
      model: usageModelId,
      inputTokens: streamUsage?.inputTokens,
      outputTokens: streamUsage?.outputTokens,
      latencyMs,
    },
    log
  );

  if (!incognito && assistantMessageId && conversationId) {
    try {
      await prisma.message.update({
        where: { id: assistantMessageId },
        data: {
          content: fullContent,
          ...(fullReasoning ? { reasoning: fullReasoning } : {}),
          ...(toolCalls.length ? { toolCalls: toolCalls as object } : {}),
          tokensUsed: streamUsage?.totalTokens ?? tokenCount,
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          latencyMs,
        },
      });

      // For a brand-new conversation, replace the verbatim first-message title
      // with a model-generated summary so the history is readable at a glance.
      if (isNewConversation && userMessageContent && fullContent.trim()) {
        const title = await generateConversationTitle(
          provider,
          modelId,
          credential.apiKey,
          userMessageContent,
          fullContent,
          signal
        );
        if (title) {
          await prisma.conversation.update({ where: { id: conversationId }, data: { title } });
          streamHub.publish(session, { type: 'title.updated', conversationId, title });
        }
      }
    } catch (persistErr) {
      log.error({ err: persistErr }, 'chat stream: finalize failed');
    }
  }

  streamHub.publish(
    session,
    incognito
      ? { streamId, incognito: true, isFinished: true }
      : { conversationId, isFinished: true }
  );
  streamHub.finish(session, 'done');

  maybeExtractMemories({
    messages,
    provider,
    credential,
    modelId,
    userId,
    conversationId,
    incognito,
    preferences,
    log,
  });
}

interface ExtractMemoriesContext {
  messages: Message[];
  provider: ProviderPlugin;
  credential: RuntimeProviderCredential;
  modelId: string;
  userId: string;
  conversationId?: string;
  incognito: boolean;
  preferences: Record<string, unknown>;
  log: AuthenticatedRequest['log'];
}

/**
 * Fire-and-forget memory extraction after a completed assistant turn. Skipped
 * for incognito chats or when the user disabled memory globally.
 */
function maybeExtractMemories(ctx: ExtractMemoriesContext): void {
  const memoryEnabled = ctx.preferences.memoryEnabled !== false;
  if (ctx.incognito || !memoryEnabled || !ctx.conversationId) return;

  void (async () => {
    const extracted = await extractMemoriesFromExchange({
      provider: ctx.provider,
      modelId: ctx.modelId,
      apiKey: ctx.credential.apiKey,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      messages: ctx.messages,
    });

    await persistExtractedMemories({
      repository: memoryRepository,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      memories: extracted.memories,
      logger: ctx.log,
    });
  })().catch((err) => {
    ctx.log.warn({ err }, 'memory extraction: unexpected failure');
  });
}

function getTitleFromMessages(messages: Array<{ role: string; content: string }>): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser) {
    return firstUser.content.slice(0, 50) || 'New Conversation';
  }
  return 'New Conversation';
}

function resolveEffort(
  provider: string,
  modelId: string,
  preferences: Record<string, unknown>
): Pick<ChatRequest, 'effort' | 'variant' | 'variantOptions'> | { error: string } {
  const effort = typeof preferences.effort === 'string' ? preferences.effort : undefined;
  if (!effort || effort === 'default') {
    return {};
  }

  const spec = getModelEffortSpec(provider, modelId);
  if (!spec) {
    return { error: `Effort variants are not configured for ${provider}/${modelId}` };
  }

  const variant = spec.variants.find((candidate) => candidate.id === effort);
  if (!variant) {
    return { error: `Unsupported effort "${effort}" for ${provider}/${modelId}` };
  }

  return { effort, variant: effort, variantOptions: variant.options };
}

router.post('/', authMiddleware, uploadFiles, async (req: AuthenticatedRequest, res) => {
  const startTime = Date.now();
  try {
    let messages: Message[];
    let preferences: Record<string, unknown> | undefined;
    let conversationId: string | undefined;

    if (req.is('multipart/form-data')) {
      const parsed = await parseMultipartBody(req);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }
      messages = parsed.messages;
      preferences = parsed.preferences;
      conversationId = parsed.conversationId;
    } else {
      messages = req.body.messages;
      preferences = req.body.preferences;
      conversationId = req.body.conversationId;
    }

    const normalized = normalizeIncognitoPreference(preferences);
    if (!normalized.ok) {
      res.status(400).json({ error: normalized.error });
      return;
    }
    const userId = req.userId!;
    const parsedPreferences = normalized.preferences;
    const incognito = normalized.incognito;

    if (!ensureValidMessages(messages, res)) return;

    const decision = route(
      {
        messages,
        model:
          typeof parsedPreferences.forceModel === 'string'
            ? parsedPreferences.forceModel
            : 'gpt-4o',
      },
      parsedPreferences
    );

    const selected = await selectConfiguredProvider(decision, userId);
    if (!selected) {
      const tried = [decision.primary, ...decision.fallbacks].map((m) => m.provider).join(', ');
      res
        .status(400)
        .json({ error: `No API key configured for any candidate provider (${tried})` });
      return;
    }

    const effort = resolveEffort(
      selected.model.provider,
      selected.model.modelId,
      parsedPreferences
    );
    if ('error' in effort) {
      res.status(400).json({ error: effort.error });
      return;
    }

    const { provider, credential } = selected;
    const recalledMemories = await recallMemoriesForChat({
      repository: memoryRepository,
      userId,
      messages,
      preferences: parsedPreferences,
      logger: req.log,
    });

    const request: ChatRequest = {
      messages: withTemporalContext(messages, parsedPreferences, recalledMemories, new Date(), {
        webSearch: true,
        python: Boolean(getDefaultSandboxRunner()),
      }),
      model: selected.model.modelId,
      temperature:
        typeof parsedPreferences.temperature === 'number'
          ? parsedPreferences.temperature
          : undefined,
      ...effort,
    };

    // Propagate client disconnect to the provider so we stop generating (and
    // paying for) tokens nobody will read.
    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    const response = await provider.chat(request, credential.apiKey, abortController.signal);

    if (abortController.signal.aborted) return;

    const latencyMs = Date.now() - startTime;

    await recordUsageEvent(
      userId,
      'single',
      {
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: response.latencyMs ?? latencyMs,
      },
      req.log
    );

    if (incognito) {
      res.json({
        content: response.content,
        model: response.model,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs ?? latencyMs,
        incognito: true,
      });
      return;
    }

    // Persist messages
    let targetConversationId = conversationId as string | undefined;
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      targetConversationId = existing.id;
    }
    if (!targetConversationId) {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: getTitleFromMessages(messages),
          modelUsed: selected.model.modelId,
        },
      });
      targetConversationId = conversation.id;
    }

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage) {
      await prisma.message.create({
        data: {
          conversationId: targetConversationId,
          role: lastUserMessage.role,
          content: lastUserMessage.content,
          providerId: selected.model.provider,
          modelId: selected.model.modelId,
          ...(lastUserMessage.attachments?.length
            ? { attachments: lastUserMessage.attachments as object }
            : {}),
        },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: targetConversationId,
        role: 'assistant',
        content: response.content,
        providerId: response.provider,
        modelId: response.model,
        tokensUsed: response.tokensUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: response.latencyMs ?? latencyMs,
      },
    });

    res.json({
      content: response.content,
      model: response.model,
      provider: response.provider,
      tokensUsed: response.tokensUsed,
      latencyMs: response.latencyMs ?? latencyMs,
      conversationId: targetConversationId,
    });

    maybeExtractMemories({
      messages,
      provider,
      credential,
      modelId: selected.model.modelId,
      userId,
      conversationId: targetConversationId,
      incognito,
      preferences: parsedPreferences,
      log: req.log,
    });
  } catch (err) {
    if (isNoChatModelsError(err)) {
      req.log.warn(
        { userId: req.userId, model: req.body?.preferences?.forceModel },
        'chat: no chat-capable model for user — surface 422'
      );
      res.status(422).json({
        error:
          'No hay modelos de chat disponibles para esta solicitud. Conectá otro proveedor o cambiá el modelo.',
      });
      return;
    }
    req.log.error({ err }, 'chat request failed');
    res.status(500).json({ error: 'Chat request failed' });
  }
});

// POST /chat/stream — streaming with POST body (for large payloads like images)
router.post('/stream', authMiddleware, uploadFiles, async (req: AuthenticatedRequest, res) => {
  const startTime = Date.now();
  // Captured here so the catch block below can surface the provider name in
  // the SSE error envelope (the frontend uses it to pick the localized error
  // message). Stays undefined if the route setup itself fails before
  // resolution (e.g. "No API key configured" — nothing to attribute to).
  let streamProviderName: string | undefined;
  try {
    let messages: Message[];
    let preferences: Record<string, unknown> | undefined;
    let conversationId: string | undefined;

    if (req.is('multipart/form-data')) {
      const parsed = await parseMultipartBody(req);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error });
        return;
      }
      messages = parsed.messages;
      preferences = parsed.preferences;
      conversationId = parsed.conversationId;
    } else {
      messages = req.body.messages;
      preferences = req.body.preferences;
      conversationId = req.body.conversationId;
    }
    const normalized = normalizeIncognitoPreference(preferences);
    if (!normalized.ok) {
      res.status(400).json({ error: normalized.error });
      return;
    }
    const userId = req.userId!;
    const parsedPreferences = normalized.preferences;
    const incognito = normalized.incognito;

    // Verify ownership if conversationId is provided (before SSE streaming)
    if (!incognito && conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
    }

    if (!ensureValidMessages(messages, res)) return;

    const decision = route(
      {
        messages,
        model:
          typeof parsedPreferences.forceModel === 'string'
            ? parsedPreferences.forceModel
            : 'gpt-4o',
      },
      parsedPreferences
    );
    // Post-deploy #1 v2 (2026-06-18): resolve ALL configured candidates up
    // front in a single pass. The first is the primary; the rest feed the
    // runtime retry loop in runChatGeneration so the stream can swap to the
    // next one when the upstream rejects a phantom / "próximamente" model
    // (e.g. gpt-5.2-pro) with 404 instead of surfacing an opaque error.
    const allCandidates = await selectAllConfiguredProviders(decision, userId);
    const selected = allCandidates[0];
    if (!selected) {
      const tried = [decision.primary, ...decision.fallbacks].map((m) => m.provider).join(', ');
      res
        .status(400)
        .json({ error: `No API key configured for any candidate provider (${tried})` });
      return;
    }

    const fallbackCandidates = allCandidates.slice(1).map((c) => ({
      provider: c.provider,
      credential: c.credential,
      modelId: c.model.modelId,
    }));

    const effort = resolveEffort(
      selected.model.provider,
      selected.model.modelId,
      parsedPreferences
    );
    if ('error' in effort) {
      res.status(400).json({ error: effort.error });
      return;
    }

    const { provider, credential } = selected;
    streamProviderName = provider.name;
    const recalledMemories = await recallMemoriesForChat({
      repository: memoryRepository,
      userId,
      messages,
      preferences: parsedPreferences,
      logger: req.log,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Persist the conversation + user message UP FRONT, before streaming. This
    // way an interrupted stream (the user navigates away, network drops) never
    // loses what they just said — the message and conversation already exist.
    let targetConversationId = incognito ? undefined : conversationId;
    const isNewConversation = !incognito && !targetConversationId;
    if (!incognito && !targetConversationId) {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: getTitleFromMessages(messages),
          modelUsed: selected.model.modelId,
        },
      });
      targetConversationId = conversation.id;
    }

    const lastUserMessage = messages[messages.length - 1];
    if (!incognito && lastUserMessage && targetConversationId) {
      await prisma.message.create({
        data: {
          conversationId: targetConversationId,
          role: lastUserMessage.role,
          content: lastUserMessage.content,
          providerId: selected.model.provider,
          modelId: selected.model.modelId,
          ...(lastUserMessage.attachments?.length
            ? { attachments: lastUserMessage.attachments as object }
            : {}),
        },
      });
    }

    // Create the assistant message up front (empty) so partial output can be
    // flushed into it incrementally (P.2): if the stream is cut mid-way the
    // conversation keeps whatever was generated instead of an empty answer.
    const assistantMessage =
      !incognito && targetConversationId
        ? await prisma.message.create({
            data: {
              conversationId: targetConversationId,
              role: 'assistant',
              content: '',
              providerId: selected.model.provider,
              modelId: selected.model.modelId,
            },
          })
        : undefined;

    const request: ChatRequest = {
      messages: withTemporalContext(messages, parsedPreferences, recalledMemories, new Date(), {
        webSearch: true,
        python: Boolean(getDefaultSandboxRunner()),
      }),
      model: selected.model.modelId,
      temperature:
        typeof parsedPreferences.temperature === 'number'
          ? parsedPreferences.temperature
          : undefined,
      ...effort,
    };

    // Decouple the generation from this connection (P.1). The request is just
    // the FIRST subscriber: if it disconnects we only detach it, the generation
    // keeps running in the background and can be re-attached later via
    // GET /chat/stream/:conversationId/live.
    const streamId = incognito ? `incognito-${randomUUID()}` : targetConversationId!;
    const session = streamHub.create(streamId, userId);
    streamHub.subscribe(session, res);
    req.on('close', () => streamHub.unsubscribe(session, res));

    // Fire-and-forget: runChatGeneration never throws (it routes all failures
    // through the hub) and ends subscribers via streamHub.finish. Post-deploy
    // #1 v2: passes the pre-resolved fallbackCandidates so the retry loop
    // can swap to the next model when the upstream rejects the primary with
    // 404 / "not a chat model".
    void runChatGeneration({
      session,
      provider,
      credential,
      request,
      messages,
      preferences: parsedPreferences,
      assistantMessageId: assistantMessage?.id,
      userId,
      modelId: selected.model.modelId,
      conversationId: targetConversationId,
      streamId,
      incognito,
      isNewConversation,
      userMessageContent: lastUserMessage?.content ?? '',
      startTime,
      log: req.log,
      fallbackCandidates,
    });
  } catch (err) {
    if (isNoChatModelsError(err)) {
      req.log.warn(
        { userId: req.userId, model: req.body?.preferences?.forceModel },
        'chat stream: no chat-capable model for user — surface 422'
      );
      if (!res.headersSent) {
        res.status(422).json({
          error:
            'No hay modelos de chat disponibles para esta solicitud. Conectá otro proveedor o cambiá el modelo.',
        });
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          type: 'turn.error',
          code: 'NO_CHAT_MODELS',
          errorKind: 'not-found',
          errorProvider: streamProviderName,
          attemptsTried: 1,
          message:
            'No hay modelos de chat disponibles para esta solicitud. Conectá otro proveedor o cambiá el modelo.',
        })}\n\n`
      );
      res.end();
      return;
    }
    req.log.error({ err }, 'chat stream: fatal error');
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Stream failed' });
      return;
    }
    res.write(
      `data: ${JSON.stringify({
        error: err instanceof Error ? err.message : 'Stream failed',
        errorKind: 'other',
        errorProvider: streamProviderName,
        attemptsTried: 1,
      })}\n\n`
    );
    res.end();
  }
});

// GET /chat/stream/:conversationId/live — re-attach to an in-flight generation
// (P.1). Replays everything streamed so far, then streams the rest live. If
// there's no active generation for this conversation, says so and closes so the
// client can simply fall back to the persisted messages.
router.get(
  '/stream/:conversationId/live',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const session = streamHub.get(req.params.conversationId);
    if (!session || session.userId !== req.userId) {
      res.write(`data: ${JSON.stringify({ type: 'stream.inactive' })}\n\n`);
      res.end();
      return;
    }

    streamHub.subscribe(session, res);
    req.on('close', () => streamHub.unsubscribe(session, res));
  }
);

// POST /chat/stream/:conversationId/stop — explicitly stop a background
// generation (the only thing that aborts it now that disconnecting doesn't).
router.post(
  '/stream/:conversationId/stop',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const session = streamHub.get(req.params.conversationId);
    if (!session || session.userId !== req.userId) {
      res.status(404).json({ error: 'No active stream' });
      return;
    }
    session.abort.abort();
    res.status(202).json({ stopped: true });
  }
);

export default router;
