import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSSE } from './useSSE';

/** Builds a fake fetch Response whose body streams the given SSE text chunks. */
function streamResponse(chunks: string[], ok = true) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve({ error: 'boom' }),
    body: {
      getReader() {
        return {
          read() {
            if (i < chunks.length) {
              return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
          releaseLock() {},
        };
      },
    },
  };
}

function makeHandlers() {
  return {
    onMessage: vi.fn(),
    onFinish: vi.fn(),
    onError: vi.fn(),
    onMultiStatus: vi.fn(),
    onCouncilEvent: vi.fn(),
  };
}

describe('useSSE', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams tokens and finishes with the final payload', async () => {
    const handlers = makeHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          streamResponse([
            'data: {"token":"Hello","provider":"openai","model":"gpt-4o"}\n\n',
            'data: {"token":" world"}\n\n',
            'data: {"isFinished":true,"conversationId":"c1"}\n\n',
          ])
        )
      )
    );

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.startStream('tok', [{ role: 'user', content: 'hi' }]);
    });

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(handlers.onMessage).toHaveBeenCalledTimes(2);
    expect(handlers.onMessage).toHaveBeenNthCalledWith(1, 'Hello', {
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(handlers.onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'c1' })
    );
    expect(handlers.onError).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it('calls onError when the response is not ok', async () => {
    const handlers = makeHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(streamResponse([], false)))
    );

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.startStream('tok', [{ role: 'user', content: 'hi' }]);
    });

    await waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(handlers.onFinish).not.toHaveBeenCalled();
  });

  it('routes to /api/chat/multi and reports the plan in Council mode', async () => {
    const handlers = makeHandlers();
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          'data: {"multiStatus":"started","plan":["a","b"]}\n\n',
          'data: {"token":"done"}\n\n',
          'data: {"isFinished":true,"conversationId":"c2"}\n\n',
        ])
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.startStream('tok', [{ role: 'user', content: 'hi' }], { multiMode: true });
    });

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/multi', expect.anything());
    expect(handlers.onMultiStatus).toHaveBeenCalledWith({ type: 'plan', plan: ['a', 'b'] });
  });

  it('surfaces SSE error events instead of swallowing them', async () => {
    const handlers = makeHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          streamResponse([
            'data: {"error":"Stored credentials for provider \\"openai\\" can no longer be decrypted. Reconnect this provider in Settings."}\n\n',
          ])
        )
      )
    );

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.startStream('tok', [{ role: 'user', content: 'hi' }]);
    });

    await waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(handlers.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Stored credentials for provider "openai" can no longer be decrypted. Reconnect this provider in Settings.',
      })
    );
    expect(handlers.onFinish).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it('forwards real council events including proposal progress', async () => {
    const handlers = makeHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          streamResponse([
            'data: {"type":"council.start","members":[{"modelId":"gpt-5","provider":"openai","displayName":"gpt-5","color":"#5cb08b"}],"plannedRounds":3}\n\n',
            'data: {"type":"voice.proposal","modelId":"gpt-5","round":1,"approachLabel":"Propuesta real","status":"complete"}\n\n',
            'data: {"type":"council.answer.delta","textDelta":"Hola"}\n\n',
            'data: {"type":"council.answer.done"}\n\n',
            'data: {"isFinished":true,"conversationId":"c3"}\n\n',
          ])
        )
      )
    );

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.startStream('tok', [{ role: 'user', content: 'hi' }], { multiMode: true });
    });

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(handlers.onCouncilEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'council.start' })
    );
    expect(handlers.onCouncilEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'voice.proposal' })
    );
    expect(handlers.onMessage).toHaveBeenCalledWith('Hola', {
      provider: 'council',
      model: 'council',
    });
  });

  it('resumeStream re-attaches to a background generation and replays it (P.1)', async () => {
    const handlers = makeHandlers();
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          'data: {"type":"conversation.created","conversationId":"c1"}\n\n',
          'data: {"token":"Resumed answer"}\n\n',
          'data: {"isFinished":true,"conversationId":"c1"}\n\n',
        ])
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.resumeStream('c1');
    });

    await waitFor(() => expect(handlers.onFinish).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/chat/stream/c1/live',
      expect.objectContaining({ method: 'GET' })
    );
    expect(handlers.onMessage).toHaveBeenCalledWith('Resumed answer', expect.anything());
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('resumeStream exits quietly when no stream is active (stream.inactive)', async () => {
    const handlers = makeHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(streamResponse(['data: {"type":"stream.inactive"}\n\n'])))
    );

    const { result } = renderHook(() => useSSE(handlers));
    act(() => {
      result.current.resumeStream('c1');
    });

    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onFinish).not.toHaveBeenCalled();
    expect(handlers.onMessage).not.toHaveBeenCalled();
  });
});
