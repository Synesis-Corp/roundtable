import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiStream } from "./api-client";
import { storage } from "./storage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function streamResponse(status = 200): Response {
  // Minimal SSE-shaped response body. We only care that apiStream returns it
  // without throwing; the caller is responsible for reading the body.
  return new Response(new ReadableStream({ start: () => {} }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("api-client — 401 refresh interceptor", () => {
  beforeEach(() => {
    storage.set("token", "old-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    storage.remove("token");
  });

  it("on 401, refreshes the access token and replays the request once with the new token", async () => {
    const fetchMock = vi
      .fn()
      // 1) original request → access token expired
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      // 2) POST /auth/refresh → new access token (refresh cookie rode along)
      .mockResolvedValueOnce(jsonResponse({ token: "new-token" }, 200))
      // 3) replayed original request → success
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiGet<{ ok: boolean }>("/conversations");

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Refresh persisted the new token…
    expect(storage.get("token")).toBe("new-token");
    // …and the refresh call carried credentials (httpOnly cookie).
    const refreshInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(refreshInit.method).toBe("POST");
    expect(refreshInit.credentials).toBe("include");
    // …and the replay used the refreshed token.
    const replayInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect((replayInit.headers as Record<string, string>).Authorization).toBe("Bearer new-token");
  });

  it("does not attempt a refresh for /auth/* paths (no loop)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "bad" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/auth/refresh")).rejects.toBeTruthy();
    // Only the original call — never a second /auth/refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("apiStream (SSE) — same 401 refresh behavior", () => {
    // Regression: before the fix, apiStream would throw on a 401 instead of
    // refreshing the token. Long-running streams (e.g. a chat that spans the
    // 15-min access token TTL) would surface "Error: Invalid token" as the
    // assistant's reply instead of transparently resuming.
    it("refreshes the access token and replays the stream when the SSE endpoint returns 401", async () => {
      const fetchMock = vi
        .fn()
        // 1) original stream request → 401
        .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
        // 2) refresh → new token
        .mockResolvedValueOnce(jsonResponse({ token: "new-token" }, 200))
        // 3) replayed stream request → 200 + stream body
        .mockResolvedValueOnce(streamResponse(200));
      vi.stubGlobal("fetch", fetchMock);

      const res = await apiStream("/chat/stream");

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(storage.get("token")).toBe("new-token");
      // The replayed request used the refreshed token.
      const replayInit = fetchMock.mock.calls[2][1] as RequestInit;
      expect((replayInit.headers as Record<string, string>).Authorization).toBe("Bearer new-token");
    });

    it("does not loop on /auth/* 401s even in apiStream", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "bad" }, 401));
      vi.stubGlobal("fetch", fetchMock);

      await expect(apiStream("/auth/refresh")).rejects.toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
