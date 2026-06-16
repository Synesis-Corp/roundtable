/* ------------------------------------------------------------------ */
/*  useChatActions — handleSend, handleRegenerate, handleStopStream.   */
/*  All three share a common prefs-builder (selectedModel/effort).     */
/* ------------------------------------------------------------------ */

import { useCallback } from 'react';
import { storage } from '../lib/storage';
import { parseSelectedModel } from '../lib/chat-format';
import type { ChatMessage, CouncilInfo, EffortSpec, MultiInfo } from '../types/chat';
import type { Attachment, UserProvider } from '@chat/sdk';
import type { StartStreamFn } from './useSSE';

interface ActionArgs {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMultiInfo: React.Dispatch<React.SetStateAction<MultiInfo | null>>;
  setCouncilInfo: React.Dispatch<React.SetStateAction<CouncilInfo | null>>;
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  selectedModel: string | null;
  multiMode: boolean;
  incognito: boolean;
  /** Connected providers — drives the defensive send gate (2026-06-14). */
  userProviders: UserProvider[];
  effortSpec: EffortSpec | null;
  selectedEffort: string;
  conversationId: string | null;
  files: File[];
  startStream: StartStreamFn;
  stopStream: () => void;
}

export function buildPrefs(args: {
  selectedModel: string | null;
  multiMode: boolean;
  incognito: boolean;
  effortSpec: EffortSpec | null;
  selectedEffort: string;
}): Record<string, unknown> {
  const prefs: Record<string, unknown> = {
    multiMode: args.multiMode,
    incognito: args.incognito,
    memoryEnabled: storage.get('memoryEnabled') !== 'false',
  };
  // Forward the browser timezone so the API can give the model the user's
  // current date/local time, and use the zone as a privacy-free location
  // proxy (mejora #4). The API runs in UTC, so it can't infer this itself.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) prefs.timezone = tz;
  } catch {
    // Intl unavailable (ancient runtime): skip — the API falls back to UTC.
  }
  // In Council mode the orchestrator picks the best model per subtask;
  // forcing a model would defeat the purpose, so we omit it.
  if (args.selectedModel && !args.multiMode) {
    const parsedModel = parseSelectedModel(args.selectedModel);
    if (parsedModel) {
      prefs.forceProvider = parsedModel.provider;
      prefs.forceModel = parsedModel.modelId;
    }
  }
  if (!args.multiMode && args.effortSpec && args.selectedEffort !== 'default') {
    prefs.effort = args.selectedEffort;
  }
  return prefs;
}

export function resolveRequestConversationId(
  conversationId: string | null,
  incognito: boolean
): string | undefined {
  return incognito ? undefined : (conversationId ?? undefined);
}

export function useChatActions({
  messages,
  setMessages,
  setError,
  setMultiInfo,
  setCouncilInfo,
  setFiles,
  setInputText,
  selectedModel,
  multiMode,
  incognito,
  userProviders,
  effortSpec,
  selectedEffort,
  conversationId,
  files,
  startStream,
  stopStream,
}: ActionArgs) {
  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() && files.length === 0) return;

      // Onboarding UX gate (2026-06-14): defensive check. The visual gate
      // in `ChatInputBar` already disables the send button when these
      // conditions hold, but this belt-and-suspenders path covers Enter
      // from the keyboard, programmatic clicks, or any route that bypasses
      // the disabled state. Without this, the user sees a cryptic 400
      // "No API key configured for any candidate provider" instead of a
      // helpful hint.
      if (userProviders.length === 0) {
        setError('Conectá un proveedor en Configuración antes de enviar.');
        return;
      }
      if (multiMode && userProviders.length < 2) {
        setError('El Consejo necesita al menos 2 providers conectados.');
        return;
      }

      setError(null);
      setMultiInfo(null);
      if (multiMode) setCouncilInfo(null);

      // Carry the attachments on the optimistic user message so the image/file
      // shows in the conversation immediately (object URLs = instant, no async
      // read). On reload the backend-persisted data URIs take over.
      const optimisticAttachments: Attachment[] = files.map((f) => ({
        type: f.type.startsWith('image/') ? 'image' : 'file',
        url: URL.createObjectURL(f),
        mimeType: f.type,
        name: f.name,
      }));

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text || (files.length > 0 ? 'Analyze this:' : ''),
        ...(optimisticAttachments.length ? { attachments: optimisticAttachments } : {}),
      };
      // Insert a pending assistant placeholder immediately so the UI shows the
      // typing/thinking indicator from the very first moment, before the model
      // sends its first token (which can take several seconds).
      const pendingMsg: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: 'assistant',
        content: '',
        provider: multiMode ? 'council' : undefined,
      };
      setMessages((prev) => [...prev, userMsg, pendingMsg]);

      const token = storage.get('token');
      if (!token) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Please log in to send messages.',
            isError: true,
          },
        ]);
        return;
      }

      const prefs = buildPrefs({ selectedModel, multiMode, incognito, effortSpec, selectedEffort });
      const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      startStream(
        token,
        allMessages,
        prefs,
        resolveRequestConversationId(conversationId, incognito),
        files.length > 0 ? files : undefined
      );
      setFiles([]);
      setInputText('');
    },
    [
      messages,
      selectedModel,
      multiMode,
      incognito,
      userProviders,
      effortSpec,
      selectedEffort,
      startStream,
      conversationId,
      files,
      setMessages,
      setError,
      setMultiInfo,
      setCouncilInfo,
      setFiles,
      setInputText,
    ]
  );

  const handleRegenerate = useCallback(
    (messageIndex: number) => {
      setError(null);
      setMultiInfo(null);
      if (multiMode) setCouncilInfo(null);

      const keptMessages = messages.slice(0, messageIndex);
      setMessages(keptMessages);

      const token = storage.get('token');
      if (!token) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Please log in to send messages.',
            isError: true,
          },
        ]);
        return;
      }

      const prefs = buildPrefs({ selectedModel, multiMode, incognito, effortSpec, selectedEffort });
      const allMessages = keptMessages.map((m) => ({ role: m.role, content: m.content }));

      const pendingMsg: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: 'assistant',
        content: '',
        provider: multiMode ? 'council' : undefined,
      };
      setMessages((prev) => [...prev, pendingMsg]);

      startStream(
        token,
        allMessages,
        prefs,
        resolveRequestConversationId(conversationId, incognito),
        undefined
      );
    },
    [
      messages,
      selectedModel,
      multiMode,
      incognito,
      effortSpec,
      selectedEffort,
      startStream,
      conversationId,
      setMessages,
      setError,
      setMultiInfo,
      setCouncilInfo,
    ]
  );

  // Wraps stopStream so we don't leave an empty placeholder behind when the
  // user aborts before the first token arrives.
  const handleStopStream = useCallback(() => {
    stopStream();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.role === 'assistant' &&
        last.content === '' &&
        last.id.startsWith('pending-')
      ) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, [stopStream, setMessages]);

  return { handleSend, handleRegenerate, handleStopStream };
}
