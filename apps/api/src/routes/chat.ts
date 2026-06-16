import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/db';
import { route } from '@chat/router';
import type { ChatRequest, Message, ProviderPlugin } from '@chat/sdk';
import { ensureValidMessages } from '../lib/validate-messages';
import { selectConfiguredProvider } from '../lib/select-provider';
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

  let stream;
  try {
    // Build the tools once per request and pass them to the provider. When
    // the provider yields tool-call/tool-result chunks, we publish them as
    // dedicated SSE events so the UI can render the "searched the web" chip.
    // The cast widens `Record<string, unknown>` to the SDK's ToolSet
    // (Record<string, Tool>); the runtime shape is identical.
    const tools = buildChatTools({
      sandboxRunner: getDefaultSandboxRunner(),
    }) as Parameters<ProviderPlugin['streamChat']>[3];
    stream = provider.streamChat(request, credential.apiKey, signal, tools);
  } catch (streamErr) {
    log.error({ err: streamErr }, 'chat stream: failed to start');
    streamHub.publish(session, {
      error: streamErr instanceof Error ? streamErr.message : 'Failed to start stream',
    });
    streamHub.finish(session, 'error');
    return;
  }

  try {
    for await (const chunk of stream) {
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
  } catch (err) {
    // Explicit stop (abort): keep whatever was generated, end cleanly.
    if (signal.aborted) {
      log.info('chat stream: generation aborted');
      if (fullContent) await flushPartial();
      streamHub.finish(session, 'done');
      return;
    }
    log.error({ err }, 'chat stream error');
    if (fullContent) await flushPartial();
    streamHub.publish(session, {
      error: err instanceof Error ? err.message : 'Stream interrupted',
    });
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
    req.log.error({ err }, 'chat request failed');
    res.status(500).json({ error: 'Chat request failed' });
  }
});

// POST /chat/stream — streaming with POST body (for large payloads like images)
router.post('/stream', authMiddleware, uploadFiles, async (req: AuthenticatedRequest, res) => {
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
    // through the hub) and ends subscribers via streamHub.finish.
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
    });
  } catch (err) {
    req.log.error({ err }, 'chat stream: fatal error');
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Stream failed' });
      return;
    }
    res.write(
      `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream failed' })}\n\n`
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
