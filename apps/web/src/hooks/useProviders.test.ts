import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProviders } from "./useProviders";

const sample = [
  { id: "openai", name: "OpenAI", npm: "@ai-sdk/openai", doc: "", env: [], modelCount: 5, popular: true },
  { id: "deepseek", name: "DeepSeek", npm: "x", doc: "", env: [], modelCount: 2, popular: false },
];

describe("useProviders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads providers and splits popular vs other", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ providers: sample }) }))
    );

    const { result } = renderHook(() => useProviders());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers).toHaveLength(2);
    expect(result.current.popularProviders.map((p) => p.id)).toEqual(["openai"]);
    expect(result.current.otherProviders.map((p) => p.id)).toEqual(["deepseek"]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) }))
    );

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.providers).toHaveLength(0);
  });
});
