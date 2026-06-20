import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/db';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import {
  resolveProviderCredential,
  type RuntimeProviderCredential,
} from '../lib/provider-credentials';
import { getProvider } from '../lib/provider-registry';
import type { Message, CouncilMember, StreamEvent, ProviderPlugin } from '@chat/sdk';
import { uploadFiles, parseMultipartBody } from '../lib/multipart';
import { ensureValidMessages } from '../lib/validate-messages';
import { findCapableModels } from '@chat/router';

import {
  buildProposalPrompt,
  buildDebatePrompt,
  buildVotePrompt,
  buildSynthesisPrompt,
  buildSynthesisReviewPrompt,
  parseVote,
  parseProposalSources,
  VoteSchema,
  resolveVoteTarget,
  selectCouncilModels,
  summarizeApproach,
  getProviderColor,
  validateCouncilConfig,
  buildCouncilMembersFromConfig,
  buildConversationContext,
  assignCouncilAngles,
  aggregateConfidence,
  unwrapWholeAnswerFence,
} from '../lib/council';
import type { ParsedProposalSource } from '../lib/council';
import { generateConversationTitle } from '../lib/title';
import { streamHub } from '../lib/stream-hub';
import { buildChatTools } from '../lib/chat-tools';
import { getDefaultSandboxRunner } from '../lib/wasi-sandbox-runner';
import { buildContextSystemMessage } from '../lib/context-message';
import { recordUsageEvent, type UsageSource } from '../lib/usage-events';
import { PrismaMemoryRepository, type PrismaMemoryClient } from '../lib/memory-prisma';
import { extractMemoriesFromExchange, persistExtractedMemories } from '../lib/memory-extractor';

const councilMemoryRepository = new PrismaMemoryRepository(prisma as unknown as PrismaMemoryClient);

function sendSSEError(res: Response, message: string) {
  res.write(`data: ${JSON.stringify({ type: 'turn.error', code: 'COUNCIL_ERROR', message })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'turn.done' })}\n\n`);
  res.end();
}

interface SearchLedgerEntry {
  query: string;
  results: ParsedProposalSource[];
  modelId: string;
  tookMs?: number;
}

interface CouncilExtractContext {
  messages: Message[];
  winnerModelId: string;
  councilModels: Array<{ provider: string; modelId: string }>;
  credentials: Map<string, RuntimeProviderCredential>;
  userId: string;
  conversationId?: string;
  incognito: boolean;
  preferences: Record<string, unknown>;
  log: AuthenticatedRequest['log'];
}

/**
 * Fire-and-forget memory extraction after a completed council turn. Uses the
 * winner model's provider/credential so we don't add a new provider selection
 * step to the critical path.
 */
function maybeExtractCouncilMemories(ctx: CouncilExtractContext): void {
  const memoryEnabled = ctx.preferences.memoryEnabled !== false;
  if (ctx.incognito || !memoryEnabled || !ctx.conversationId) return;

  const winner = ctx.councilModels.find((m) => m.modelId === ctx.winnerModelId);
  if (!winner) return;

  const credential = ctx.credentials.get(winner.provider);
  const provider = credential ? getProvider(winner.provider, credential.options) : null;
  if (!provider || !credential) return;

  void (async () => {
    const extracted = await extractMemoriesFromExchange({
      provider,
      modelId: winner.modelId,
      apiKey: credential.apiKey,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      messages: ctx.messages,
    });

    await persistExtractedMemories({
      repository: councilMemoryRepository,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      memories: extracted.memories,
      logger: ctx.log,
    });
  })().catch((err) => {
    ctx.log.warn({ err }, 'council memory extraction: unexpected failure');
  });
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

function filterActiveCapabilities<T extends { modelId: string; provider: string }>(
  models: T[],
  activeByProvider: Map<string, string[]>
): T[] {
  return models.filter((m) => {
    const active = activeByProvider.get(m.provider);
    if (!active || active.length === 0) return true;
    return active.includes(m.modelId);
  });
}

function collectSharedSources(ledger: SearchLedgerEntry[]): ParsedProposalSource[] {
  const seen = new Set<string>();
  const sources: ParsedProposalSource[] = [];
  for (const entry of ledger) {
    for (const r of entry.results) {
      const key = `${r.title}|${r.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(r);
    }
  }
  return sources;
}

export async function handleCouncilRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    let messages: Message[];
    let conversationId: string | undefined;
    let preferences: Record<string, unknown> | undefined;

    if (req.is('multipart/form-data')) {
      const parsed = await parseMultipartBody(req);
      if (!parsed.ok) {
        sendSSEError(res, parsed.error);
        return;
      }
      messages = parsed.messages;
      conversationId = parsed.conversationId;
      preferences = parsed.preferences;
    } else {
      messages = req.body.messages;
      conversationId = req.body.conversationId;
      preferences = req.body.preferences;
    }

    const normalized = normalizeIncognitoPreference(preferences);
    if (!normalized.ok) {
      sendSSEError(res, normalized.error);
      return;
    }
    preferences = normalized.preferences;
    const incognito = normalized.incognito;
    const userId = req.userId!;

    // Verify ownership
    if (!incognito && conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!existing) {
        sendSSEError(res, 'Conversation not found');
        return;
      }
    }

    if (!ensureValidMessages(messages, res)) return;

    const lastUserMsg = messages[messages.length - 1]?.content ?? '';

    // #6 — give the Council the chat it was dropped into: the prior turns as a
    // transcript (everything before the current question), and the same temporal
    // context the single chat gets (#4). The timezone arrives from the browser
    // via preferences; the system message is prepended to every council call.
    const conversationHistory = buildConversationContext(messages.slice(0, -1));
    const councilTimezone =
      typeof preferences?.timezone === 'string' ? preferences.timezone : undefined;
    const councilContext = buildContextSystemMessage(new Date(), councilTimezone);

    // Get connected providers
    const userProviderConfigs = await prisma.providerConfig.findMany({
      where: { userId, isActive: true },
    });

    if (userProviderConfigs.length < 2) {
      sendSSEError(res, 'Se necesitan al menos 2 proveedores conectados para el Consejo');
      return;
    }

    // Resolve credentials
    const credentials = new Map<string, RuntimeProviderCredential>();
    for (const config of userProviderConfigs) {
      credentials.set(config.providerId, await resolveProviderCredential(config, prisma));
    }

    // Get all capable text models from connected providers and choose
    // a strong + lightweight representative per provider when possible.
    // Honor the user's active-models allow-list (#1): hidden models should not
    // appear in the council either.
    const activeConfigs = await prisma.activeModelsConfig.findMany({
      where: { userId },
      select: { providerId: true, modelIds: true },
    });
    const activeByProvider = new Map(activeConfigs.map((c) => [c.providerId, c.modelIds]));

    const textModels = filterActiveCapabilities(
      findCapableModels(['text'], []).filter((m) => {
        const credential = credentials.get(m.provider);
        return credential && getProvider(m.provider, credential.options);
      }),
      activeByProvider
    );

    if (textModels.length === 0) {
      sendSSEError(
        res,
        activeConfigs.length > 0
          ? 'No hay modelos de texto activos disponibles en los proveedores conectados. Revisá tus modelos activos en Settings.'
          : 'No hay modelos de texto disponibles en los proveedores conectados'
      );
      return;
    }

    // Build candidate list from registry for both auto-select and validation
    const candidateModels = textModels.map((model) => ({
      modelId: model.modelId,
      provider: model.provider,
      displayName: model.modelId,
      contextWindow: model.contextWindow,
      reasoning: model.features?.includes('reasoning'),
      toolCall: model.features?.includes('tool-use'),
      structuredOutput: false,
      attachment: model.modalities?.includes('image') || model.modalities?.includes('audio'),
    }));

    // Try manual config first, fallback to auto-selection
    let councilModels: Array<
      import('../lib/council').CouncilCandidateModel & {
        tier: import('../lib/council').CouncilTier;
      }
    >;

    const userConfig = await prisma.councilConfig.findUnique({
      where: { userId },
    });

    if (userConfig && userConfig.mode === 'manual' && userConfig.modelIds.length > 0) {
      const connectedProviderSet = new Set(userProviderConfigs.map((c) => c.providerId));
      const validation = validateCouncilConfig(
        userConfig.modelIds,
        connectedProviderSet,
        textModels
      );

      if (validation.valid) {
        councilModels = buildCouncilMembersFromConfig(validation.validModels, candidateModels);
      } else {
        req.log.warn(
          { error: validation.error, modelIds: userConfig.modelIds },
          'Council: manual config invalid, falling back to auto-selection'
        );
        councilModels = selectCouncilModels(candidateModels, lastUserMsg);
      }
    } else {
      councilModels = selectCouncilModels(candidateModels, lastUserMsg);
    }

    if (councilModels.length < 2) {
      sendSSEError(
        res,
        'El Consejo necesita al menos 2 modelos de texto utilizables entre los proveedores conectados'
      );
      return;
    }

    // Shared ledger for web_search calls across the whole deliberation.
    const searchLedger: SearchLedgerEntry[] = [];
    const councilTools = buildChatTools({
      sandboxRunner: getDefaultSandboxRunner(),
      onSearch: (query, result) => {
        searchLedger.push({
          query,
          results: result.results,
          modelId: 'unknown',
          tookMs: result.took_ms,
        });
      },
    }) as Parameters<ProviderPlugin['chat']>[3];

    // Assign angles cyclically to the selected council members.
    const angleAssignments = assignCouncilAngles(councilModels);

    // Build members list
    const members: CouncilMember[] = councilModels.map((m) => ({
      modelId: m.modelId,
      provider: m.provider,
      displayName: m.displayName || m.modelId,
      color: getProviderColor(m.provider),
      tier: m.tier,
    }));

    // Persist the conversation + user message UP FRONT. A council deliberation
    // is long; if the client leaves mid-way we still keep their question and the
    // conversation, instead of losing everything until the final synthesis.
    let targetConversationId = incognito ? undefined : conversationId;
    const isNewConversation = !incognito && !targetConversationId;
    if (!incognito && !targetConversationId) {
      const conversation = await prisma.conversation.create({
        data: { userId, title: lastUserMsg.slice(0, 50) || 'Consejo', modelUsed: 'council' },
      });
      targetConversationId = conversation.id;
    }
    const lastUserAttachments = messages[messages.length - 1]?.attachments;
    if (!incognito && targetConversationId) {
      await prisma.message.create({
        data: {
          conversationId: targetConversationId,
          role: 'user',
          content: lastUserMsg,
          providerId: 'user',
          modelId: 'user',
          ...(lastUserAttachments?.length ? { attachments: lastUserAttachments as object } : {}),
        },
      });
    }

    // Decouple the deliberation from this connection (P.1): the request is just
    // the first subscriber. Disconnecting only detaches it — the council keeps
    // deliberating in the background and can be re-attached via
    // GET /chat/stream/:conversationId/live.
    const streamId = incognito ? `incognito-${randomUUID()}` : targetConversationId!;
    const session = streamHub.create(streamId, userId);
    streamHub.subscribe(session, res);
    req.on('close', () => streamHub.unsubscribe(session, res));
    const abortController = session.abort;
    const emit = (event: StreamEvent | Record<string, unknown>) =>
      streamHub.publish(session, event);

    // Wall-clock start of the deliberation.
    const deliberationStart = Date.now();

    // Run the (long) deliberation detached from the request. It never throws:
    // all failures route through the hub and end with streamHub.finish.
    void (async () => {
      try {
        // Emit turn.start
        if (incognito) {
          emit({
            type: 'turn.start',
            mode: 'council',
            incognito: true,
            streamId,
          } as Record<string, unknown>);
        } else {
          emit({
            type: 'turn.start',
            mode: 'council',
            conversationId: targetConversationId!,
          });
        }
        emit({ type: 'council.start', members, plannedRounds: 3 });
        emit(
          incognito
            ? { type: 'stream.created', streamId, incognito: true }
            : { type: 'conversation.created', conversationId: targetConversationId }
        );

        // Token accounting: the council burns real tokens across every round on
        // every member. UsageEvent records each provider call with its real
        // provider/model; the assistant message keeps the aggregate for history
        // compatibility without driving the usage dashboard.
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const accountUsage = async (response: UsageSource) => {
          totalInputTokens += response.inputTokens ?? 0;
          totalOutputTokens += response.outputTokens ?? 0;
          await recordUsageEvent(userId, 'council', response, req.log);
        };

        // ========== RONDA 1: PROPUESTAS (paralelo) ==========
        emit({ type: 'round.start', round: 1, kind: 'proposals' });

        const proposals = new Map<string, { content: string; approachLabel: string }>();
        const proposalSources = new Map<string, ParsedProposalSource[]>();
        const proposalReasoning = new Map<string, string>();

        await Promise.all(
          councilModels.map(async (model) => {
            const credential = credentials.get(model.provider)!;
            const provider = getProvider(model.provider, credential.options);
            if (!provider) return;

            try {
              const angle = angleAssignments.get(model.modelId);
              const prompt = buildProposalPrompt(
                lastUserMsg,
                model.modelId,
                conversationHistory,
                angle
              );
              const response = await provider.chat(
                {
                  messages: [councilContext, { role: 'user', content: prompt }],
                  model: model.modelId,
                },
                credential.apiKey,
                abortController.signal,
                // Council models can independently decide to invoke web_search
                // when the user asks for current data. Calls are recorded in the
                // shared ledger so later rounds can reuse the sources.
                councilTools
              );

              await accountUsage(response);
              proposals.set(model.modelId, {
                content: response.content,
                approachLabel: summarizeApproach(response.content),
              });

              const sources = parseProposalSources(response.content);
              if (sources.length) {
                proposalSources.set(model.modelId, sources);
              }

              if (response.reasoning) {
                proposalReasoning.set(model.modelId, response.reasoning);
                emit({
                  type: 'voice.reasoning',
                  modelId: model.modelId,
                  reasoning: response.reasoning,
                } as Record<string, unknown>);
              }

              emit({
                type: 'voice.proposal',
                modelId: model.modelId,
                round: 1,
                approachLabel: summarizeApproach(response.content),
                proposalText: response.content,
                status: 'complete',
                angle,
                sources: sources.length ? sources : undefined,
                reasoning: response.reasoning,
              } as Record<string, unknown>);
            } catch (err) {
              req.log.error({ err, modelId: model.modelId }, 'Council: proposal failed');
              emit({
                type: 'voice.error',
                modelId: model.modelId,
                code: 'PROPOSAL_FAILED',
                message: err instanceof Error ? err.message : 'Unknown error',
              });
            }
          })
        );

        if (proposals.size === 0) {
          emit({
            type: 'turn.error',
            code: 'COUNCIL_ERROR',
            message: 'Ningún modelo pudo generar una propuesta',
          });
          streamHub.finish(session, 'error');
          return;
        }

        // Merge any sources parsed from proposals into the shared ledger.
        for (const [modelId, sources] of proposalSources.entries()) {
          searchLedger.push({ query: 'inline-proposal', results: sources, modelId });
        }
        const sharedSources = collectSharedSources(searchLedger);

        emit({ type: 'round.end', round: 1 });

        // ========== RONDA 2: DEBATE (paralelo) ==========
        emit({ type: 'round.start', round: 2, kind: 'debate' });

        const debates = new Map<string, string>();
        const allProposals = Array.from(proposals.entries()).map(([modelId, p]) => ({
          modelId,
          content: p.content,
        }));

        await Promise.all(
          councilModels.map(async (model) => {
            const credential = credentials.get(model.provider)!;
            const provider = getProvider(model.provider, credential.options);
            if (!provider) return;

            try {
              const prompt = buildDebatePrompt(
                lastUserMsg,
                model.modelId,
                allProposals,
                sharedSources
              );
              const response = await provider.chat(
                {
                  messages: [councilContext, { role: 'user', content: prompt }],
                  model: model.modelId,
                },
                credential.apiKey,
                abortController.signal,
                // Debate can also trigger web_search if a model wants to verify
                // a factual claim made by another member.
                councilTools
              );

              await accountUsage(response);
              debates.set(model.modelId, response.content);

              emit({
                type: 'voice.debate',
                modelId: model.modelId,
                round: 2,
                debateText: response.content,
                status: 'complete',
              });
            } catch (err) {
              req.log.error({ err, modelId: model.modelId }, 'Council: debate failed');
            }
          })
        );

        emit({ type: 'round.end', round: 2 });

        // ========== RONDA 3: VOTO (paralelo) ==========
        emit({ type: 'round.start', round: 3, kind: 'vote' });

        const votes = new Map<
          string,
          {
            targetModelId: string;
            reason: string;
            improvement: string;
            confidence?: 'high' | 'medium' | 'low';
            risk?: string;
          }
        >();
        const availableModelIds = allProposals.map((proposal) => proposal.modelId);

        await Promise.all(
          councilModels.map(async (model) => {
            const credential = credentials.get(model.provider)!;
            const provider = getProvider(model.provider, credential.options);
            if (!provider) return;

            try {
              const debateSummary = debates.get(model.modelId) || '';
              const prompt = buildVotePrompt(
                lastUserMsg,
                model.modelId,
                allProposals,
                debateSummary
              );
              const voteRequest = {
                messages: [councilContext, { role: 'user' as const, content: prompt }],
                model: model.modelId,
              };

              // Primary: native structured output (the model returns a typed
              // {vote, reason, improvement, confidence, risk}). Fallback: text +
              // regex parse, so a provider/model that can't honor object mode
              // still casts a vote. Voting is a decision over existing
              // proposals, so no web_search tool is offered here.
              let parsed: {
                vote: string;
                reason: string;
                improvement: string;
                confidence?: 'high' | 'medium' | 'low';
                risk?: string;
              } | null = null;
              try {
                const structured = await provider.chatStructured(
                  voteRequest,
                  VoteSchema,
                  credential.apiKey,
                  abortController.signal
                );
                await accountUsage(structured);
                parsed = structured.object;
              } catch (structErr) {
                req.log.warn(
                  { err: structErr, modelId: model.modelId },
                  'Council: structured vote failed, falling back to text parse'
                );
                const response = await provider.chat(
                  voteRequest,
                  credential.apiKey,
                  abortController.signal
                );
                await accountUsage(response);
                const textParsed = parseVote(response.content);
                if (textParsed) {
                  parsed = {
                    vote: textParsed.vote,
                    reason: textParsed.reason,
                    improvement: textParsed.improvement,
                    confidence: textParsed.confidence,
                    risk: textParsed.risk,
                  };
                }
              }

              const resolvedTarget = parsed
                ? resolveVoteTarget(parsed.vote, availableModelIds)
                : null;
              if (parsed && resolvedTarget) {
                votes.set(model.modelId, {
                  targetModelId: resolvedTarget,
                  reason: parsed.reason,
                  improvement: parsed.improvement,
                  confidence: parsed.confidence,
                  risk: parsed.risk,
                });

                const voteType = resolvedTarget === model.modelId ? 'for' : 'changed';

                emit({
                  type: 'vote.cast',
                  modelId: model.modelId,
                  vote: voteType,
                  targetModelId: resolvedTarget,
                  reason: parsed.reason,
                  improvement: parsed.improvement,
                  confidence: parsed.confidence,
                  risk: parsed.risk,
                } as Record<string, unknown>);
              }
            } catch (err) {
              req.log.error({ err, modelId: model.modelId }, 'Council: vote failed');
            }
          })
        );

        // Calculate winner
        const voteCounts = new Map<string, number>();
        for (const [, vote] of votes) {
          voteCounts.set(vote.targetModelId, (voteCounts.get(vote.targetModelId) || 0) + 1);
        }

        let winnerModelId = councilModels[0]?.modelId || allProposals[0]?.modelId || '';
        let maxVotes = 0;
        for (const [modelId, count] of voteCounts) {
          if (count > maxVotes) {
            maxVotes = count;
            winnerModelId = modelId;
            continue;
          }

          if (count === maxVotes && winnerModelId) {
            const currentWinner = councilModels.find((model) => model.modelId === winnerModelId);
            const challenger = councilModels.find((model) => model.modelId === modelId);
            const currentWinnerTier = currentWinner?.tier === 'strong' ? 1 : 0;
            const challengerTier = challenger?.tier === 'strong' ? 1 : 0;

            if (challengerTier > currentWinnerTier) {
              winnerModelId = modelId;
            }
          }
        }

        const totalProposals = allProposals.length;
        const tallyFor = maxVotes;
        const tallyTotal = totalProposals;
        const consensus = tallyFor === tallyTotal && tallyTotal > 0;
        const aggregatedConfidence = aggregateConfidence(
          Array.from(votes.values()).map((v) => v.confidence)
        );

        emit({
          type: 'council.decision',
          winnerModelId,
          tally: { for: tallyFor, total: tallyTotal },
          consensus,
          confidence: aggregatedConfidence,
        } as Record<string, unknown>);

        // ========== SÍNTESIS: Respuesta ganadora ==========
        const winnerProposal = proposals.get(winnerModelId);
        const allVotes = Array.from(votes.entries()).map(([modelId, v]) => ({
          modelId,
          vote: v.targetModelId,
          reason: v.reason,
          improvement: v.improvement,
          confidence: v.confidence,
          risk: v.risk,
        }));

        let synthesisAnswer = '';

        if (winnerProposal) {
          const synthesisPrompt = buildSynthesisPrompt(
            lastUserMsg,
            winnerModelId,
            winnerProposal.content,
            allVotes,
            allProposals,
            conversationHistory,
            sharedSources
          );

          const synthesisModel =
            councilModels.find((m) => m.modelId === winnerModelId) || councilModels[0];
          const credential = credentials.get(synthesisModel.provider)!;
          const provider = getProvider(synthesisModel.provider, credential.options);

          if (provider) {
            try {
              const response = await provider.chat(
                {
                  messages: [councilContext, { role: 'user', content: synthesisPrompt }],
                  model: synthesisModel.modelId,
                },
                credential.apiKey,
                abortController.signal,
                // Synthesis may also invoke web_search if the model needs
                // more context than the deliberation provided.
                councilTools
              );

              await accountUsage(response);
              synthesisAnswer = unwrapWholeAnswerFence(response.content);

              // Second-pass review: ask the winner to verify it incorporated
              // all suggested improvements. Keep it short and deterministic.
              const improvements = allVotes.map((v) => v.improvement).filter(Boolean);
              if (improvements.length > 0) {
                try {
                  const reviewPrompt = buildSynthesisReviewPrompt(synthesisAnswer, improvements);
                  const reviewResponse = await provider.chat(
                    {
                      messages: [councilContext, { role: 'user', content: reviewPrompt }],
                      model: synthesisModel.modelId,
                    },
                    credential.apiKey,
                    abortController.signal
                  );
                  await accountUsage(reviewResponse);
                  if (reviewResponse.content.trim()) {
                    synthesisAnswer = unwrapWholeAnswerFence(reviewResponse.content);
                  }
                } catch (reviewErr) {
                  req.log.warn(
                    { err: reviewErr },
                    'Council: second-pass synthesis review failed, keeping first draft'
                  );
                }
              }

              // Stream the synthesis response token by token
              const tokens = synthesisAnswer.split(/(\s+)/);
              for (const token of tokens) {
                if (abortController.signal.aborted) break;
                emit({ type: 'council.answer.delta', textDelta: token });
              }

              emit({ type: 'council.answer.done' });
            } catch (err) {
              req.log.error({ err }, 'Council: synthesis failed');
              emit({
                type: 'turn.error',
                code: 'SYNTHESIS_FAILED',
                message: 'Failed to synthesize final answer',
              });
            }
          }
        }

        const deliberationMs = Date.now() - deliberationStart;
        const webSearchCount = searchLedger.length;
        const finalAnswer = unwrapWholeAnswerFence(
          synthesisAnswer || winnerProposal?.content || 'No se pudo generar una respuesta'
        );

        if (!incognito && targetConversationId) {
          // Conversation + user message were persisted before deliberation.
          const assistantMessage = await prisma.message.create({
            data: {
              conversationId: targetConversationId,
              role: 'assistant',
              content: finalAnswer,
              providerId: 'council',
              modelId: winnerModelId,
              inputTokens: totalInputTokens || null,
              outputTokens: totalOutputTokens || null,
              tokensUsed: totalInputTokens + totalOutputTokens || null,
            },
          });

          await prisma.councilTurn.create({
            data: {
              messageId: assistantMessage.id,
              conversationId: targetConversationId,
              winnerModelId,
              tallyFor,
              tallyTotal,
              consensus,
              answer: finalAnswer,
              confidence: aggregatedConfidence,
              deliberationMs,
              searchSources: sharedSources.length
                ? (sharedSources as unknown as object)
                : undefined,
              voices: {
                create: members
                  .filter((member) => proposals.has(member.modelId))
                  .map((member) => ({
                    modelId: member.modelId,
                    provider: member.provider,
                    displayName: member.displayName,
                    angle: angleAssignments.get(member.modelId) ?? null,
                    approachLabel:
                      proposals.get(member.modelId)?.approachLabel ||
                      summarizeApproach(proposals.get(member.modelId)?.content || ''),
                    vote:
                      member.modelId === winnerModelId
                        ? 'for'
                        : votes.get(member.modelId)?.targetModelId === winnerModelId
                          ? 'for'
                          : 'changed',
                    proposalText: proposals.get(member.modelId)?.content,
                    sources: proposalSources.has(member.modelId)
                      ? (proposalSources.get(member.modelId) as unknown as object)
                      : undefined,
                    debateText: debates.get(member.modelId) ?? null,
                    voteReason: votes.get(member.modelId)?.reason ?? null,
                    voteImprovement: votes.get(member.modelId)?.improvement ?? null,
                    confidence: votes.get(member.modelId)?.confidence ?? null,
                    risk: votes.get(member.modelId)?.risk ?? null,
                    reasoning: proposalReasoning.get(member.modelId) ?? null,
                  })),
              },
            },
          });
        }

        req.log.info(
          {
            userId,
            conversationId: targetConversationId,
            winnerModelId,
            members: members.length,
            deliberationMs,
            webSearchCount,
            confidence: aggregatedConfidence,
            consensus,
          },
          'Council: deliberation complete'
        );

        // Generate a readable title for brand-new conversations, using the winner's
        // model and the synthesized answer.
        if (!incognito && targetConversationId && isNewConversation && synthesisAnswer.trim()) {
          const titleModel =
            councilModels.find((m) => m.modelId === winnerModelId) ?? councilModels[0];
          const titleCredential = credentials.get(titleModel.provider);
          const titleProvider = titleCredential
            ? getProvider(titleModel.provider, titleCredential.options)
            : null;
          if (titleProvider && titleCredential) {
            const title = await generateConversationTitle(
              titleProvider,
              titleModel.modelId,
              titleCredential.apiKey,
              lastUserMsg,
              synthesisAnswer,
              abortController.signal
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

        // Final event
        emit({ type: 'turn.done' });
        emit(
          incognito
            ? { streamId, incognito: true, isFinished: true }
            : { conversationId: targetConversationId, isFinished: true }
        );
        streamHub.finish(session, 'done');

        maybeExtractCouncilMemories({
          messages,
          winnerModelId,
          councilModels,
          credentials,
          userId,
          conversationId: targetConversationId,
          incognito,
          preferences,
          log: req.log,
        });
      } catch (err) {
        req.log.error({ err }, 'Council: deliberation failed');
        emit({
          type: 'turn.error',
          code: 'COUNCIL_ERROR',
          message: err instanceof Error ? err.message : 'Council failed',
        });
        streamHub.finish(session, 'error');
      }
    })();
  } catch (err) {
    req.log.error({ err }, 'Council: fatal error');
    if (!res.writableEnded) {
      sendSSEError(res, err instanceof Error ? err.message : 'Council failed');
    }
  }
}

const router = Router();
router.post('/council', authMiddleware, uploadFiles, handleCouncilRequest);
export default router;
