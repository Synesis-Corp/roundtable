import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildChatTools } from './chat-tools';
import { MockSandboxRunner } from './python-sandbox';

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchJson(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  ) as unknown as typeof fetch;
}

describe('buildChatTools', () => {
  beforeEach(() => {
    process.env.SEARXNG_URL = 'http://searxng:8080';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it('exposes a web_search tool with the expected shape', () => {
    const tools = buildChatTools();
    expect(tools.web_search).toBeDefined();
    expect(typeof tools.web_search.execute).toBe('function');
  });

  it("describes the tool purely functionally — no 'use this whenever' directive", () => {
    // Regression: a previous version said "Use this whenever the user asks
    // about current events, ..." which caused the model to announce its
    // decision about searching ("sin necesidad de búsqueda, ya que...").
    // The fix makes the description purely descriptive so the model
    // decides silently. This test pins the behavior so a future refactor
    // doesn't accidentally bring back the meta-commentary.
    const tools = buildChatTools();
    const description = (tools.web_search as { description?: string }).description ?? '';
    expect(description).toMatch(/Search the public web/i);
    expect(description).not.toMatch(/use this whenever/i);
    expect(description).not.toMatch(/use this when/i);
    expect(description).not.toMatch(/use this for/i);
    expect(description).not.toMatch(/whenever the user/i);
  });

  it('execute({ query }) calls SearXNG and returns a normalized response on success', async () => {
    mockFetchJson(200, {
      results: [{ title: 'El Universo', url: 'https://eluniverso.com/x', content: 'Top story' }],
    });

    const tools = buildChatTools();
    const result = (await tools.web_search.execute(
      { query: 'Ecuador news' },
      { toolCallId: 't1', messages: [] }
    )) as { query: string; results: Array<{ title: string }>; error?: string };

    expect(result.query).toBe('Ecuador news');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.title).toBe('El Universo');
    expect(result.error).toBeUndefined();
  });

  it('execute returns a soft-failure shape (not throws) when SearXNG is down', async () => {
    mockFetchJson(503, { error: 'down' });

    const tools = buildChatTools();
    const result = (await tools.web_search.execute(
      { query: 'anything' },
      { toolCallId: 't1', messages: [] }
    )) as { error?: string; results: unknown[] };

    // The model receives a structured "unavailable" answer, not a thrown
    // exception. It can then decide to say "I couldn't search" or ignore
    // and continue. The chat endpoint never sees a 500.
    expect(result.error).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  describe('run_python', () => {
    it('is NOT offered when no sandbox runner is configured', () => {
      const tools = buildChatTools();
      expect(tools.run_python).toBeUndefined();
    });

    it('is offered when a sandbox runner is injected', () => {
      const tools = buildChatTools({ sandboxRunner: new MockSandboxRunner({ stdout: '' }) });
      expect(tools.run_python).toBeDefined();
      expect(typeof (tools.run_python as { execute?: unknown }).execute).toBe('function');
    });

    it('execute({ code }) runs through the sandbox and returns stdout/result', async () => {
      const runner = new MockSandboxRunner({ stdout: '4\n', result: '4' });
      const tools = buildChatTools({ sandboxRunner: runner });
      const result = (await (
        tools.run_python as { execute: (args: { code: string }, ctx: unknown) => Promise<unknown> }
      ).execute({ code: 'print(2 + 2)' }, { toolCallId: 't1', messages: [] })) as {
        stdout: string;
        result?: string;
        error?: string;
      };

      expect(result.stdout).toBe('4\n');
      expect(result.result).toBe('4');
      expect(result.error).toBeUndefined();
      expect(runner.lastCode).toBe('print(2 + 2)');
    });

    it('execute returns a soft error for blocked imports without running', async () => {
      const runner = new MockSandboxRunner({ stdout: 'should not run' });
      const tools = buildChatTools({ sandboxRunner: runner });
      const result = (await (
        tools.run_python as { execute: (args: { code: string }, ctx: unknown) => Promise<unknown> }
      ).execute({ code: "import os\nos.listdir('/')" }, { toolCallId: 't1', messages: [] })) as {
        stdout: string;
        error?: string;
      };

      expect(result.error).toMatch(/import/i);
      expect(runner.lastCode).toBeNull();
    });
  });
});
