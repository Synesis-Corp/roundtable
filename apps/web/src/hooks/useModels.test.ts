import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useModels } from "./useModels";
import { PROVIDERS_CHANGED_EVENT } from "../lib/provider-events";

const sample = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", description: "omni", contextWindow: 128000, capabilities: ["vision"] },
  { id: "claude", name: "Claude", provider: "anthropic", description: "reasoning", contextWindow: 200000, capabilities: [] },
];

describe("useModels", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("returns empty without a token (no fetch)", async () => {
    localStorage.removeItem("token");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads models with the auth header", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ models: sample }) })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.models).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/providers/connected",
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } })
    );
  });

  it("filters with searchModels (name/provider/description)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ models: sample }) }))
    );

    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let filtered = result.current.searchModels("anthropic");
    expect(filtered.map((m) => m.id)).toEqual(["claude"]);

    filtered = result.current.searchModels("omni");
    expect(filtered.map((m) => m.id)).toEqual(["gpt-4o"]);

    act(() => undefined);
    expect(result.current.searchModels("")).toHaveLength(2);
  });

  it("exposes a refetch function on the return value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ models: sample }) }))
    );

    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.refetch).toBe("function");
  });

  it("refetches when PROVIDERS_CHANGED_EVENT is dispatched on window", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ models: sample }) })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initial mount already triggered one fetch.
    const callsAfterMount = fetchSpy.mock.calls.length;
    expect(callsAfterMount).toBe(1);

    // Dispatching the event should trigger a second fetch.
    await act(async () => {
      window.dispatchEvent(new CustomEvent(PROVIDERS_CHANGED_EVENT));
      // Let the microtask queue flush.
      await Promise.resolve();
    });

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("removes the providers-changed listener on unmount", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ models: sample }) })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result, unmount } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsAfterMount = fetchSpy.mock.calls.length;
    unmount();

    // After unmount, dispatching the event should NOT trigger another fetch.
    await act(async () => {
      window.dispatchEvent(new CustomEvent(PROVIDERS_CHANGED_EVENT));
      await Promise.resolve();
    });

    expect(fetchSpy.mock.calls.length).toBe(callsAfterMount);
  });
});
