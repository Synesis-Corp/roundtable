import { useState, useEffect } from 'react';
import { apiStream } from '../lib/api-client';

export type StartStreamFn = (
  token: string,
  messages: Array<{ role: string; content: string }>,
  preferences?: Record<string, unknown>,
  conversationId?: string,
  files?: File[]
) => void;

export interface SSEOptions {
  onMessage: (token: string, metadata?: { provider?: string; model?: string }) => void;
  /** Fired for reasoning/thinking deltas (empty-token chunks with a reasoning field). */
  onReasoning?: (reasoning: string, metadata?: { provider?: string; model?: string }) => void;
  onFinish: (extra?: Record<string, unknown>) => void;
  onError: (error: Error) => void;
  onMultiStatus?: (status: {
    type: 'started' | 'plan' | 'contributors';
    plan?: string[];
    contributors?: Array<{ task: string; provider: string; model: string }>;
  }) => void;
  onCouncilEvent?: (event: Record<string, unknown>) => void;
  /** Fired as soon as the backend persists the conversation (before the answer). */
  onConversationCreated?: (conversationId: string) => void;
  /** Fired when the backend generates a readable title for the conversation. */
  onTitleUpdated?: (conversationId: string, title: string) => void;
  /** Fired when the model invokes a tool (e.g. web_search). The UI uses this
   *  to render the "searched the web" chip on the assistant message. */
  onToolCall?: (call: { name: string; args: unknown }) => void;
  /** Fired when a tool's execute function returns a result. Pairs with the
   *  most recent onToolCall by tool name (the AI SDK doesn't echo the
   *  toolCallId back in the SSE event today). */
  onToolResult?: (result: { name: string; result: unknown }) => void;
}

export function useSSE({
  onMessage,
  onReasoning,
  onFinish,
  onError,
  onMultiStatus,
  onCouncilEvent,
  onConversationCreated,
  onTitleUpdated,
  onToolCall,
  onToolResult,
}: SSEOptions) {
  const [streaming, setStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Shared SSE reader: parses the event stream from a Response and routes each
  // event through the callbacks. Used by both a fresh POST stream and a GET
  // re-attach to a background generation (P.1), so the event handling lives in
  // exactly one place.
  const consume = async (res: Response) => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream reader');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') {
            onFinish();
            setStreaming(false);
            return;
          }
          try {
            const json = JSON.parse(payload);

            // Re-attach probe: there is no live generation for this conversation.
            // Not an error — the caller just falls back to the persisted messages.
            if (json.type === 'stream.inactive') {
              setStreaming(false);
              return;
            }

            // Early persistence signal — the conversation + user message are
            // already saved; surface it so the sidebar can refresh.
            if (json.type === 'conversation.created' && typeof json.conversationId === 'string') {
              onConversationCreated?.(json.conversationId);
              continue;
            }

            if (
              json.type === 'title.updated' &&
              typeof json.conversationId === 'string' &&
              typeof json.title === 'string'
            ) {
              onTitleUpdated?.(json.conversationId, json.title);
              continue;
            }

            // Tool calling: the model invoked a tool (e.g. web_search). The
            // AI SDK doesn't echo the toolCallId back in the SSE event today
            // (only the tool name + args/result), so the consumer pairs
            // tool.call with the most recent matching tool.result by name.
            if (json.type === 'tool.call' && typeof json.name === 'string') {
              onToolCall?.({ name: json.name, args: json.args });
              continue;
            }
            if (json.type === 'tool.result' && typeof json.name === 'string') {
              onToolResult?.({ name: json.name, result: json.result });
              continue;
            }

            const councilEventTypes = new Set([
              'turn.start',
              'turn.done',
              'turn.error',
              'council.start',
              'round.start',
              'round.end',
              'voice.delta',
              'voice.proposal',
              'voice.reasoning',
              'voice.debate',
              'voice.error',
              'vote.cast',
              'council.decision',
              'council.answer.delta',
              'council.answer.done',
            ]);

            // Handle council events
            if (typeof json.type === 'string' && councilEventTypes.has(json.type)) {
              onCouncilEvent?.(json);
              if (json.type === 'turn.error' && json.message) {
                throw new Error(String(json.message));
              }
              if (json.type === 'council.answer.delta' && json.textDelta) {
                onMessage(json.textDelta, { provider: 'council', model: 'council' });
              }
              continue;
            }

            // Handle multi status messages
            if (json.multiStatus === 'started' && json.plan) {
              onMultiStatus?.({ type: 'plan', plan: json.plan });
              continue;
            }
            if (json.multiStatus === 'complete' && json.contributors) {
              onMultiStatus?.({ type: 'contributors', contributors: json.contributors });
            }

            // Reasoning/thinking deltas arrive as empty-token chunks carrying a
            // `reasoning` field — route them separately so the answer text stays
            // clean while the thinking trace builds in its own block.
            if (json.reasoning) {
              onReasoning?.(json.reasoning, {
                provider: json.provider,
                model: json.model,
              });
            }

            // Handle token streaming
            if (json.token) {
              onMessage(json.token, {
                provider: json.provider,
                model: json.model,
              });
            }

            if (json.isFinished) {
              onFinish(json);
              setStreaming(false);
              return;
            }
            if (json.error) {
              throw new Error(json.error);
            }
          } catch (err) {
            if (err instanceof SyntaxError) {
              // ignore malformed JSON chunks only
              continue;
            }
            throw err;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    onFinish();
    setStreaming(false);
  };

  const handleStreamError = (err: Error) => {
    if (err.name !== 'AbortError') {
      onError(err);
    }
    setStreaming(false);
  };

  const startStream = (
    token: string,
    messages: Array<{ role: string; content: string }>,
    preferences?: Record<string, unknown>,
    conversationId?: string,
    files?: File[]
  ) => {
    const ctrl = new AbortController();
    setAbortController(ctrl);
    setStreaming(true);

    // Build request body: FormData when files exist, JSON otherwise
    const hasFiles = files && files.length > 0;
    let body: string | FormData;
    const extraHeaders: Record<string, string> = {};

    if (hasFiles) {
      const formData = new FormData();
      formData.append('messages', JSON.stringify(messages));
      if (preferences) formData.append('preferences', JSON.stringify(preferences));
      if (conversationId) formData.append('conversationId', conversationId);
      for (const file of files!) {
        formData.append('files', file, file.name);
      }
      body = formData;
    } else {
      body = JSON.stringify({
        messages,
        preferences,
        ...(conversationId ? { conversationId } : {}),
      });
      extraHeaders['Content-Type'] = 'application/json';
    }

    const url = preferences?.multiMode ? '/chat/multi' : '/chat/stream';

    apiStream(url, {
      method: 'POST',
      headers: extraHeaders,
      signal: ctrl.signal,
      body,
    })
      .then(consume)
      .catch(handleStreamError);
  };

  // Re-attach to a generation that is still running in the background for this
  // conversation (P.1). If the backend says the stream is inactive, `consume`
  // exits quietly and the caller keeps the already-loaded persisted messages.
  const resumeStream = (conversationId: string) => {
    const ctrl = new AbortController();
    setAbortController(ctrl);
    setStreaming(true);

    apiStream(`/chat/stream/${conversationId}/live`, {
      method: 'GET',
      signal: ctrl.signal,
    })
      .then(consume)
      .catch(handleStreamError);
  };

  const stopStream = () => {
    abortController?.abort();
    setStreaming(false);
  };

  useEffect(() => {
    return () => {
      abortController?.abort();
    };
  }, [abortController]);

  return { streaming, startStream, resumeStream, stopStream };
}
