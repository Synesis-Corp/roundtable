/* ------------------------------------------------------------------ */
/*  useChatStreamHandlers — builds the SSE callback object for useSSE. */
/*  All 10 handlers (onMessage, onReasoning, onToolCall, onToolResult, */
/*  onFinish, onConversationCreated, onTitleUpdated, onError,          */
/*  onMultiStatus, onCouncilEvent) live here, mutating the shared      */
/*  state via setters passed in by the page.                           */
/* ------------------------------------------------------------------ */

import type { NavigateFunction } from 'react-router-dom';
import type {
  ChatMessage,
  CouncilInfo,
  CouncilMember,
  CouncilVote,
  MultiInfo,
} from '../types/chat';
import type { SSEOptions } from './useSSE';

interface HandlerArgs {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setConversationTitleState: React.Dispatch<React.SetStateAction<string | null>>;
  setMultiInfo: React.Dispatch<React.SetStateAction<MultiInfo | null>>;
  setCouncilInfo: React.Dispatch<React.SetStateAction<CouncilInfo | null>>;
  navigate: NavigateFunction;
  routeConversationId: string | undefined;
}

export function useChatStreamHandlers({
  setMessages,
  setConversationId,
  setConversationTitleState,
  setMultiInfo,
  setCouncilInfo,
  navigate,
  routeConversationId,
}: HandlerArgs): SSEOptions {
  return {
    onMessage: (token, metadata) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.id.startsWith('final-')) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + token,
            provider: metadata?.provider ?? last.provider,
            model: metadata?.model ?? last.model,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: token,
            provider: metadata?.provider,
            model: metadata?.model,
          },
        ];
      });
    },
    onReasoning: (reasoning, metadata) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.id.startsWith('final-')) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            reasoning: (last.reasoning ?? '') + reasoning,
            provider: metadata?.provider ?? last.provider,
            model: metadata?.model ?? last.model,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: '',
            reasoning,
            provider: metadata?.provider,
            model: metadata?.model,
          },
        ];
      });
    },
    onToolCall: (call) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last.id.startsWith('final-')) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            toolCalls: [...(last.toolCalls ?? []), { name: call.name, args: call.args }],
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: '',
            toolCalls: [{ name: call.name, args: call.args }],
          },
        ];
      });
    },
    onToolResult: (result) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        const updated = [...prev];
        const calls = [...(last.toolCalls ?? [])];
        const idx = calls.map((c) => c.name).lastIndexOf(result.name);
        if (idx === -1) {
          calls.push({ name: result.name, args: undefined, result: result.result });
        } else {
          calls[idx] = { ...calls[idx]!, result: result.result };
        }
        updated[updated.length - 1] = { ...last, toolCalls: calls };
        return updated;
      });
    },
    onFinish: (extra) => {
      const newId = extra && typeof extra.conversationId === 'string' ? extra.conversationId : null;
      if (newId) {
        if (!routeConversationId || routeConversationId !== newId) {
          setConversationId(newId);
          navigate(`/c/${newId}`, { replace: true });
        }
      }
      window.dispatchEvent(new CustomEvent('conversation:updated'));
    },
    onConversationCreated: (id) => {
      setConversationId(id);
      window.dispatchEvent(new CustomEvent('conversation:updated'));
    },
    onTitleUpdated: (_id, title) => {
      setConversationTitleState(title);
      window.dispatchEvent(new CustomEvent('conversation:updated'));
    },
    onError: (err) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${err.message}`,
          isError: true,
        };
        if (
          last &&
          last.role === 'assistant' &&
          last.content === '' &&
          last.id.startsWith('pending-')
        ) {
          const updated = [...prev];
          updated[updated.length - 1] = errMsg;
          return updated;
        }
        return [...prev, errMsg];
      });
    },
    onMultiStatus: (status) => {
      if (status.type === 'plan' && status.plan) {
        setMultiInfo({ plan: status.plan });
      } else if (status.type === 'contributors' && status.contributors) {
        setMultiInfo((prev) => ({ ...(prev ?? {}), contributors: status.contributors }));
      }
    },
    onCouncilEvent: (event) => {
      const type = typeof event.type === 'string' ? event.type : '';

      if (type === 'council.start') {
        setCouncilInfo({
          members: (event.members as CouncilMember[]) ?? [],
          winnerModelId: '',
          tally: { for: 0, total: 0 },
          consensus: false,
          votes: [],
          answer: '',
          plannedRounds: typeof event.plannedRounds === 'number' ? event.plannedRounds : 3,
          currentRound: 1,
          currentRoundKind: 'proposals',
          status: 'running',
        });
        return;
      }

      if (type === 'round.start') {
        setCouncilInfo((prev) =>
          prev
            ? {
                ...prev,
                currentRound: event.round as number,
                currentRoundKind: event.kind as CouncilInfo['currentRoundKind'],
                status: 'running',
              }
            : prev
        );
        return;
      }

      if (type === 'voice.proposal') {
        setCouncilInfo((prev) => {
          if (!prev) return null;
          const member = prev.members.find((m) => m.modelId === event.modelId);
          const sources = Array.isArray(event.sources)
            ? event.sources.filter(
                (s): s is { title: string; url: string; snippet: string } =>
                  typeof s === 'object' &&
                  s !== null &&
                  typeof (s as Record<string, unknown>).title === 'string' &&
                  typeof (s as Record<string, unknown>).url === 'string' &&
                  typeof (s as Record<string, unknown>).snippet === 'string'
              )
            : undefined;
          const nextVote: CouncilVote = {
            modelId: event.modelId as string,
            provider: member?.provider || 'unknown',
            displayName: member?.displayName || (event.modelId as string),
            approachLabel: (event.approachLabel as string) || '',
            proposalText: typeof event.proposalText === 'string' ? event.proposalText : undefined,
            angle: typeof event.angle === 'string' ? event.angle : undefined,
            sources,
            reasoning: typeof event.reasoning === 'string' ? event.reasoning : undefined,
            tier: member?.tier,
            vote: prev.votes.find((v) => v.modelId === event.modelId)?.vote ?? 'pending',
            isWinner: false,
          };
          return {
            ...prev,
            votes: prev.votes.some((v) => v.modelId === nextVote.modelId)
              ? prev.votes.map((v) => (v.modelId === nextVote.modelId ? { ...v, ...nextVote } : v))
              : [...prev.votes, nextVote],
          };
        });
        return;
      }

      if (type === 'voice.reasoning') {
        setCouncilInfo((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            votes: prev.votes.some((v) => v.modelId === event.modelId)
              ? prev.votes.map((v) =>
                  v.modelId === event.modelId
                    ? {
                        ...v,
                        reasoning:
                          typeof event.reasoning === 'string' ? event.reasoning : v.reasoning,
                      }
                    : v
                )
              : prev.votes,
          };
        });
        return;
      }

      if (type === 'voice.debate') {
        setCouncilInfo((prev) => {
          if (!prev) return null;
          const member = prev.members.find((m) => m.modelId === event.modelId);
          const existing = prev.votes.find((v) => v.modelId === event.modelId);
          const debateText = typeof event.debateText === 'string' ? event.debateText : undefined;
          const nextVote: CouncilVote = {
            modelId: event.modelId as string,
            provider: member?.provider || existing?.provider || 'unknown',
            displayName: member?.displayName || existing?.displayName || (event.modelId as string),
            approachLabel: existing?.approachLabel || '',
            proposalText: existing?.proposalText,
            debateText,
            tier: member?.tier,
            vote: existing?.vote ?? 'pending',
            isWinner: existing?.isWinner ?? false,
          };
          return {
            ...prev,
            votes: prev.votes.some((v) => v.modelId === nextVote.modelId)
              ? prev.votes.map((v) => (v.modelId === nextVote.modelId ? { ...v, ...nextVote } : v))
              : [...prev.votes, nextVote],
          };
        });
        return;
      }

      if (type === 'vote.cast') {
        setCouncilInfo((prev) => {
          if (!prev) return null;
          const member = prev.members.find((m) => m.modelId === event.modelId);
          const existing = prev.votes.find((v) => v.modelId === event.modelId);
          const confidenceValue =
            event.confidence === 'high' ||
            event.confidence === 'medium' ||
            event.confidence === 'low'
              ? event.confidence
              : undefined;
          const nextVote: CouncilVote = {
            modelId: event.modelId as string,
            provider: member?.provider || 'unknown',
            displayName: member?.displayName || (event.modelId as string),
            approachLabel: existing?.approachLabel || '',
            proposalText: existing?.proposalText,
            debateText: existing?.debateText,
            voteReason: typeof event.reason === 'string' ? event.reason : existing?.voteReason,
            voteImprovement:
              typeof event.improvement === 'string' ? event.improvement : existing?.voteImprovement,
            confidence: confidenceValue,
            risk: typeof event.risk === 'string' ? event.risk : existing?.risk,
            tier: member?.tier,
            vote: event.vote as CouncilVote['vote'],
            isWinner: false,
          };
          return {
            ...prev,
            votes: prev.votes.some((v) => v.modelId === nextVote.modelId)
              ? prev.votes.map((v) => (v.modelId === nextVote.modelId ? { ...v, ...nextVote } : v))
              : [...prev.votes, nextVote],
          };
        });
        return;
      }

      if (type === 'council.decision') {
        setCouncilInfo((prev) => {
          if (!prev) return null;
          const confidenceValue =
            event.confidence === 'high' ||
            event.confidence === 'medium' ||
            event.confidence === 'low'
              ? event.confidence
              : undefined;
          return {
            ...prev,
            winnerModelId: event.winnerModelId as string,
            tally: event.tally as { for: number; total: number },
            consensus: event.consensus as boolean,
            confidence: confidenceValue,
            currentRound: prev.plannedRounds ?? 3,
            currentRoundKind: 'synthesis',
            votes: prev.votes.map((v) => ({
              ...v,
              vote:
                v.modelId === event.winnerModelId
                  ? 'for'
                  : v.vote === 'pending'
                    ? 'changed'
                    : v.vote,
              isWinner: v.modelId === event.winnerModelId,
            })),
          };
        });
        return;
      }

      if (type === 'council.answer.delta') {
        setCouncilInfo((prev) =>
          prev
            ? {
                ...prev,
                answer: `${prev.answer}${String(event.textDelta ?? '')}`,
                currentRound: prev.plannedRounds ?? 3,
                currentRoundKind: 'synthesis',
                status: 'running',
              }
            : prev
        );
        return;
      }

      if (type === 'council.answer.done') {
        setCouncilInfo((prev) =>
          prev
            ? {
                ...prev,
                status: 'done',
                currentRound: prev.plannedRounds ?? 3,
                currentRoundKind: 'synthesis',
              }
            : prev
        );
        return;
      }

      if (type === 'turn.error') {
        setCouncilInfo((prev) => (prev ? { ...prev, status: 'error' } : prev));
        return;
      }

      if (type === 'voice.error') {
        setCouncilInfo((prev) => {
          if (!prev) return null;
          const member = prev.members.find((m) => m.modelId === event.modelId);
          if (!member) return prev;
          const fallbackRow: CouncilVote = {
            modelId: member.modelId,
            provider: member.provider,
            displayName: member.displayName,
            approachLabel: `No se pudo completar esta participación: ${String(event.message ?? 'error desconocido')}`,
            proposalText: undefined,
            tier: member.tier,
            vote: 'against',
            isWinner: false,
          };
          return {
            ...prev,
            votes: prev.votes.some((vote) => vote.modelId === member.modelId)
              ? prev.votes.map((vote) =>
                  vote.modelId === member.modelId ? { ...vote, ...fallbackRow } : vote
                )
              : [...prev.votes, fallbackRow],
          };
        });
      }
    },
  };
}
