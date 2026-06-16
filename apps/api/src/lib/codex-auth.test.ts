import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCodexFetch, CODEX_API_ENDPOINT } from "./codex-auth";

const ORIGINAL_FETCH = globalThis.fetch;

describe("createCodexFetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("rewrites a /chat/completions URL to the ChatGPT Codex /responses endpoint", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch("https://api.openai.com/v1/chat/completions", { method: "POST" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toBe(CODEX_API_ENDPOINT);
    expect(String(calledUrl)).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(calledInit.method).toBe("POST");
  });

  it("preserves the caller's Authorization and custom headers on the rewritten request", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-jwt-token",
        "ChatGPT-Account-Id": "acc-123",
        "X-Custom": "keep-me",
      },
    });

    const [, calledInit] = mockFetch.mock.calls[0]!;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-jwt-token");
    expect(headers["ChatGPT-Account-Id"]).toBe("acc-123");
    expect(headers["X-Custom"]).toBe("keep-me");
  });

  it("injects originator: roundtable on the rewritten request", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch("https://api.openai.com/v1/chat/completions", { method: "POST" });

    const [, calledInit] = mockFetch.mock.calls[0]!;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers.originator).toBe("roundtable");
  });

  it("leaves the URL untouched when it is already the Codex /responses endpoint", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch(CODEX_API_ENDPOINT, { method: "POST", body: JSON.stringify({ input: [] }) });

    const [calledUrl] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toBe(CODEX_API_ENDPOINT);
  });

  it("injects a default instructions field when the body lacks one", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch(CODEX_API_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.4", input: [] }),
    });

    const [, calledInit] = mockFetch.mock.calls[0]!;
    const sent = JSON.parse(calledInit.body as string);
    expect(typeof sent.instructions).toBe("string");
    expect(sent.instructions.length).toBeGreaterThan(0);
  });

  it("forces store: false even when the body sets store: true", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch(CODEX_API_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ input: [], store: true }),
    });

    const [, calledInit] = mockFetch.mock.calls[0]!;
    const sent = JSON.parse(calledInit.body as string);
    expect(sent.store).toBe(false);
  });

  it("does not overwrite an instructions field the caller already provided", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));

    const fetch = createCodexFetch();
    await fetch(CODEX_API_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ input: [], instructions: "custom system prompt" }),
    });

    const [, calledInit] = mockFetch.mock.calls[0]!;
    const sent = JSON.parse(calledInit.body as string);
    expect(sent.instructions).toBe("custom system prompt");
  });
});
