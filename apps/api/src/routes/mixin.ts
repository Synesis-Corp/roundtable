import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { findCapableModels, isUseCaseEligible } from '@chat/router';
import type { Message, ModelCapability, ProviderPlugin, StreamEvent } from '@chat/sdk';
import { prisma } from '../lib/db';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import {
  resolveProviderCredential,
  type RuntimeProviderCredential,
} from '../lib/provider-credentials';
import { getProvider } from '../lib/provider-registry';
import { uploadFiles, parseMultipartBody } from '../lib/multipart';
import { ensureValidMessages } from '../lib/validate-messages';
import { buildMixinSynthesisPrompt, selectMixinModels } from '../lib/mixin';
import { unwrapWholeAnswerFence } from '../lib/council';
import { generateConversationTitle } from '../lib/title';
import { streamHub } from '../lib/stream-hub';
import { recallMemoriesForChat, withTemporalContext } from '../lib/context-message';
import { PrismaMemoryRepository, type PrismaMemoryClient } from '../lib/memory-prisma';
import { extractMemoriesFromExchange, persistExtractedMemories } from '../lib/memory-extractor';
import { recordUsageEvent, type UsageSource } from '../lib/usage-events';

const router = Router();
const mixinMemoryRepository = new PrismaMemoryRepository(prisma as unknown as PrismaMemoryClient);

function sendSSEError(res: Response, message: string) {
  res.write(`data: ${JSON.stringify({ type: 'turn.error', code: 'MIXIN_ERROR', message })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'turn.done' })}\n\n`);
  res.end();
}

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

function filterActiveModels(
  models: ModelCapability[],
  activeByProvider: Map<string, string[]>
): ModelCapability[] {
  return models.filter((model) => {
    const active = activeByProvider.get(model.provider);
    return !active || active.length === 0 || active.includes(model.modelId);
  });
}

function titleFrom(messages: Message[]): string {
  return messages.find((message) => message.role === 'user')?.content.slice(0, 50) || 'Mezcla';
}

function maybeExtractMixinMemories({
  messages,
  provider,
  credential,
  modelId,
  userId,
  conversationId,
  incognito,
  preferences,
  log,
}: {
  messages: Message[];
  provider: ProviderPlugin;
  credential: RuntimeProviderCredential;
  modelId: string;
  userId: string;
  conversationId?: string;
  incognito: boolean;
  preferences: Record<string, unknown>;
  log: AuthenticatedRequest['log'];
}): void {
  if (incognito || preferences.memoryEnabled === false || !conversationId) return;

  void (async () => {
    const extracted = await extractMemoriesFromExchange({
      provider,
      modelId,
      apiKey: credential.apiKey,
      userId,
      conversationId,
      messages,
    });
    await persistExtractedMemories({
      repository: mixinMemoryRepository,
      userId,
      conversationId,
      memories: extracted.memories,
      logger: log,
    });
  })().catch((err) => log.warn({ err }, 'mixin memory extraction: unexpected failure'));
}

/**
 * Mixin is intentionally not a Council shortcut. Every selected model answers
 * the user independently in parallel, then the highest-ranked successful model
 * produces one transparent-to-the-user synthesis. There is no debate or vote.
 */
async function handleMixinRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    let messages: Message[];
    let conversationId: string | undefined;
    let rawPreferences: Record<string, unknown> | undefined;

    if (req.is('multipart/form-data')) {
      const parsed = await parseMultipartBody(req);
      if (!parsed.ok) return sendSSEError(res, parsed.error);
      messages = parsed.messages;
      conversationId = parsed.conversationId;
      rawPreferences = parsed.preferences;
    } else {
      messages = req.body.messages;
      conversationId = req.body.conversationId;
      rawPreferences = req.body.preferences;
    }

    const normalized = normalizeIncognitoPreference(rawPreferences);
    if (!normalized.ok) return sendSSEError(res, normalized.error);
    if (!ensureValidMessages(messages, res)) return;

    const { preferences, incognito } = normalized;
    const userId = req.userId!;
    if (!incognito && conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!existing) return sendSSEError(res, 'Conversation not found');
    }

    const [providerConfigs, activeConfigs] = await Promise.all([
      prisma.providerConfig.findMany({ where: { userId, isActive: true } }),
      prisma.activeModelsConfig.findMany({
        where: { userId },
        select: { providerId: true, modelIds: true },
      }),
    ]);

    const credentials = new Map<string, RuntimeProviderCredential>();
    await Promise.all(
      providerConfigs.map(async (config) => {
        try {
          credentials.set(config.providerId, await resolveProviderCredential(config, prisma));
        } catch (err) {
          req.log.warn(
            { err, providerId: config.providerId },
            'Mixin: provider credential unavailable'
          );
        }
      })
    );

    const activeByProvider = new Map(
      activeConfigs.map((config) => [config.providerId, config.modelIds])
    );
    const eligibleModels = filterActiveModels(
      findCapableModels(['text'], []).filter((model) => {
        const credential = credentials.get(model.provider);
        return Boolean(
          credential &&
          getProvider(model.provider, credential.options) &&
          isUseCaseEligible(model.provider, model.modelId, 'single')
        );
      }),
      activeByProvider
    );
    const mixinModels = selectMixinModels(eligibleModels);

    if (mixinModels.length === 0) {
      return sendSSEError(
        res,
        'No hay modelos de chat activos disponibles para Mezcla. Revisá tus proveedores y modelos activos en Settings.'
      );
    }

    let targetConversationId = incognito ? undefined : conversationId;
    const isNewConversation = !incognito && !targetConversationId;
    if (!incognito && !targetConversationId) {
      const conversation = await prisma.conversation.create({
        data: { userId, title: titleFrom(messages), modelUsed: 'mixin' },
      });
      targetConversationId = conversation.id;
    }

    const lastUserMessage = messages[messages.length - 1];
    if (!incognito && targetConversationId && lastUserMessage) {
      await prisma.message.create({
        data: {
          conversationId: targetConversationId,
          role: lastUserMessage.role,
          content: lastUserMessage.content,
          providerId: 'user',
          modelId: 'user',
          ...(lastUserMessage.attachments?.length
            ? { attachments: lastUserMessage.attachments as object }
            : {}),
        },
      });
    }

    const streamId = incognito ? `incognito-${randomUUID()}` : targetConversationId!;
    const session = streamHub.create(streamId, userId);
    streamHub.subscribe(session, res);
    req.on('close', () => streamHub.unsubscribe(session, res));
    const emit = (event: StreamEvent | Record<string, unknown>) =>
      streamHub.publish(session, event);

    void (async () => {
      try {
        emit(
          (incognito
            ? { type: 'turn.start', mode: 'mixin', incognito: true, streamId }
            : {
                type: 'turn.start',
                mode: 'mixin',
                conversationId: targetConversationId,
              }) as Record<string, unknown>
        );
        emit({
          type: 'mixin.start',
          modelCount: mixinModels.length,
          totalEligibleCount: eligibleModels.length,
          capped: eligibleModels.length > mixinModels.length,
        });
        emit(
          incognito
            ? { type: 'stream.created', streamId, incognito: true }
            : { type: 'conversation.created', conversationId: targetConversationId }
        );

        const recalledMemories = await recallMemoriesForChat({
          repository: mixinMemoryRepository,
          userId,
          messages,
          preferences,
          logger: req.log,
        });
        const generationMessages = withTemporalContext(
          messages,
          preferences,
          recalledMemories,
          new Date()
        );
        const startTime = Date.now();
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const accountUsage = async (source: UsageSource) => {
          totalInputTokens += source.inputTokens ?? 0;
          totalOutputTokens += source.outputTokens ?? 0;
          await recordUsageEvent(userId, 'mixin', source, req.log);
        };

        const settled = await Promise.all(
          mixinModels.map(async (model) => {
            const credential = credentials.get(model.provider)!;
            const provider = getProvider(model.provider, credential.options);
            if (!provider) return null;
            try {
              const response = await provider.chat(
                { messages: generationMessages, model: model.modelId },
                credential.apiKey,
                session.abort.signal
              );
              await accountUsage({
                provider: response.provider,
                model: response.model,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                latencyMs: response.latencyMs,
              });
              return { model, provider, credential, response };
            } catch (err) {
              req.log.warn({ err, modelId: model.modelId }, 'Mixin: independent response failed');
              emit({ type: 'mixin.member.error', modelId: model.modelId });
              return null;
            }
          })
        );
        const successes = settled.filter(
          (
            result
          ): result is {
            model: ModelCapability;
            provider: ProviderPlugin;
            credential: RuntimeProviderCredential;
            response: Awaited<ReturnType<ProviderPlugin['chat']>>;
          } => result !== null
        );

        if (successes.length === 0) {
          emit({
            type: 'turn.error',
            code: 'MIXIN_FAILED',
            message: 'Ningún modelo pudo responder.',
          });
          streamHub.finish(session, 'error');
          return;
        }

        const synthesizer = successes[0]!;
        let finalAnswer = unwrapWholeAnswerFence(synthesizer.response.content);
        try {
          const synthesis = await synthesizer.provider.chat(
            {
              messages: [
                ...generationMessages,
                {
                  role: 'user',
                  content: buildMixinSynthesisPrompt(
                    successes.map(({ model, response }) => ({
                      provider: model.provider,
                      modelId: model.modelId,
                      content: response.content,
                    }))
                  ),
                },
              ],
              model: synthesizer.model.modelId,
            },
            synthesizer.credential.apiKey,
            session.abort.signal
          );
          await accountUsage({
            provider: synthesis.provider,
            model: synthesis.model,
            inputTokens: synthesis.inputTokens,
            outputTokens: synthesis.outputTokens,
            latencyMs: synthesis.latencyMs,
          });
          finalAnswer = unwrapWholeAnswerFence(synthesis.content) || finalAnswer;
        } catch (err) {
          req.log.warn(
            { err, modelId: synthesizer.model.modelId },
            'Mixin: synthesis failed, using lead response'
          );
        }
        if (!finalAnswer.trim()) finalAnswer = 'No se pudo generar una respuesta.';

        for (const token of finalAnswer.split(/(\s+)/)) {
          if (session.abort.signal.aborted) break;
          emit({ token, provider: 'mixin', model: 'mixin', isFinished: false });
        }

        const latencyMs = Date.now() - startTime;
        if (!incognito && targetConversationId) {
          await prisma.message.create({
            data: {
              conversationId: targetConversationId,
              role: 'assistant',
              content: finalAnswer,
              providerId: 'mixin',
              modelId: synthesizer.model.modelId,
              inputTokens: totalInputTokens || null,
              outputTokens: totalOutputTokens || null,
              tokensUsed: totalInputTokens + totalOutputTokens || null,
              latencyMs,
            },
          });

          if (isNewConversation && finalAnswer.trim()) {
            const title = await generateConversationTitle(
              synthesizer.provider,
              synthesizer.model.modelId,
              synthesizer.credential.apiKey,
              lastUserMessage?.content ?? '',
              finalAnswer,
              session.abort.signal
            );
            if (title) {
              await prisma.conversation.update({
                where: { id: targetConversationId },
                data: { title },
              });
              emit({ type: 'title.updated', conversationId: targetConversationId, title });
            }
          }
        }

        emit({ type: 'mixin.done', modelCount: successes.length });
        emit(
          incognito
            ? { streamId, incognito: true, isFinished: true }
            : { conversationId: targetConversationId, isFinished: true }
        );
        streamHub.finish(session, 'done');

        maybeExtractMixinMemories({
          messages,
          provider: synthesizer.provider,
          credential: synthesizer.credential,
          modelId: synthesizer.model.modelId,
          userId,
          conversationId: targetConversationId,
          incognito,
          preferences,
          log: req.log,
        });
      } catch (err) {
        req.log.error({ err }, 'Mixin: generation failed');
        emit({
          type: 'turn.error',
          code: 'MIXIN_ERROR',
          message: err instanceof Error ? err.message : 'No se pudo completar Mezcla.',
        });
        streamHub.finish(session, 'error');
      }
    })();
  } catch (err) {
    req.log.error({ err }, 'Mixin: fatal error');
    if (!res.writableEnded)
      sendSSEError(res, err instanceof Error ? err.message : 'No se pudo completar Mezcla.');
  }
}

router.post('/mixin', authMiddleware, uploadFiles, handleMixinRequest);

export default router;
