/* ------------------------------------------------------------------ */
/*  useConversationLoader — fetches /conversations/:id when the route  */
/*  param changes. Handles abort on unmount, resumes background         */
/*  streams, and resets state when navigating to a fresh chat ("/").   */
/* ------------------------------------------------------------------ */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { storage } from '../lib/storage';
import { apiGet } from '../lib/api-client';
import { mapPersistedCouncilInfo } from '../lib/chat-page-helpers';
import type { ChatMessage, CouncilInfo, MultiInfo } from '../types/chat';
import type { Attachment } from '@chat/sdk';

interface LoaderArgs {
  routeConversationId: string | undefined;
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setConversationTitleState: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setMultiInfo: React.Dispatch<React.SetStateAction<MultiInfo | null>>;
  setCouncilInfo: React.Dispatch<React.SetStateAction<CouncilInfo | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setLoadingConversation: React.Dispatch<React.SetStateAction<boolean>>;
  resumeStream: (id: string) => void;
  stopStream: () => void;
}

interface PersistedMessage {
  id: string;
  role: string;
  content: string;
  providerId: string;
  modelId: string;
  attachments?: Attachment[] | null;
  reasoning?: string | null;
  toolCalls?: Array<{ name: string; args?: unknown; result?: unknown }> | null;
  councilTurn?: Parameters<typeof mapPersistedCouncilInfo>[0]['councilTurn'];
}

interface PersistedConversation {
  title?: string;
  isStreaming?: boolean;
  messages: PersistedMessage[];
}

export function useConversationLoader({
  routeConversationId,
  setConversationId,
  setConversationTitleState,
  setMessages,
  setMultiInfo,
  setCouncilInfo,
  setError,
  setLoadingConversation,
  resumeStream,
  stopStream,
}: LoaderArgs): void {
  const { t } = useTranslation();
  useEffect(() => {
    const id = routeConversationId ?? null;
    if (id === null) {
      setConversationId(null);
      setConversationTitleState(null);
      setMessages([]);
      setMultiInfo(null);
      setCouncilInfo(null);
      setError(null);
      setLoadingConversation(false);
      return;
    }

    const token = storage.get('token');
    if (!token) return;

    let aborted = false;
    setLoadingConversation(true);
    setError(null);
    apiGet<PersistedConversation>(`/conversations/${id}`)
      .then((data) => {
        if (aborted) return;
        if (data.messages) {
          const hydratedMessages: ChatMessage[] = data.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            provider: m.providerId,
            model: m.modelId,
            attachments: m.attachments ?? undefined,
            reasoning: m.reasoning ?? undefined,
            toolCalls: m.toolCalls ?? undefined,
            councilInfo: mapPersistedCouncilInfo({ councilTurn: m.councilTurn ?? null }),
          }));

          // If a generation is still running in the background (the user left
          // mid-stream and came back), drop the in-progress assistant message so
          // the re-attached live replay rebuilds it from scratch instead of
          // appending onto a persisted partial (which would duplicate). (P.1)
          const resuming = data.isStreaming === true;
          const visibleMessages =
            resuming && hydratedMessages[hydratedMessages.length - 1]?.role === 'assistant'
              ? hydratedMessages.slice(0, -1)
              : hydratedMessages;

          setMessages(visibleMessages);
          setConversationId(id);
          setConversationTitleState(data.title ?? null);
          setMultiInfo(null);
          setCouncilInfo(
            resuming
              ? null
              : ([...hydratedMessages].reverse().find((message) => message.councilInfo)
                  ?.councilInfo ?? null)
          );

          if (resuming) {
            // Re-attach to the live stream. If the backend has since finished,
            // it replies stream.inactive and the hook exits quietly.
            resumeStream(id);
          }
        }
      })
      .catch((err) => {
        if (aborted) return;
        setError(err instanceof Error ? err.message : t('chat.errors.loadConversationFailed'));
        setMessages([]);
      })
      .finally(() => {
        if (!aborted) setLoadingConversation(false);
      });

    return () => {
      aborted = true;
      // Abort any in-flight SSE stream so it doesn't keep writing into the
      // outgoing message state after we've moved on to a different conversation.
      // The App.tsx `key={conversationId}` already remounts the whole ChatPage
      // (which triggers the useSSE cleanup that aborts the AbortController);
      // this is belt-and-suspenders: it keeps the behavior correct even if the
      // `key` is removed in a future refactor. (Regression fixed 2026-06-11.)
      stopStream();
    };
    // resumeStream is stable enough for our purposes; re-running this loader on
    // every render would refetch the conversation in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeConversationId]);
}
