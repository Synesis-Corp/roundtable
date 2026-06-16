import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { storage } from "../lib/storage";
import { buildPrefs, resolveRequestConversationId, useChatActions } from "./useChatActions";

afterEach(() => {
  storage.remove("memoryEnabled");
  vi.restoreAllMocks();
});

describe("useChatActions incognito request contract", () => {
  it("includes a strict boolean incognito flag in preferences", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Guayaquil" }),
    } as Intl.DateTimeFormat);

    expect(
      buildPrefs({
        selectedModel: null,
        multiMode: false,
        effortSpec: null,
        selectedEffort: "default",
        incognito: true,
      }),
    ).toMatchObject({
      multiMode: false,
      incognito: true,
      timezone: "America/Guayaquil",
    });
  });

  it("drops a persisted conversation id only for incognito requests", () => {
    expect(resolveRequestConversationId("conversation-1", true)).toBeUndefined();
    expect(resolveRequestConversationId("conversation-1", false)).toBe("conversation-1");
  });
});

describe("useChatActions memory request contract", () => {
  const baseArgs = {
    selectedModel: null,
    multiMode: false,
    incognito: false,
    effortSpec: null,
    selectedEffort: "default",
  };

  it("sends memoryEnabled=true when the user has not disabled memory", () => {
    expect(buildPrefs(baseArgs).memoryEnabled).toBe(true);
  });

  it("sends memoryEnabled=false after the Settings toggle is disabled", () => {
    storage.set("memoryEnabled", "false");

    expect(buildPrefs(baseArgs).memoryEnabled).toBe(false);
  });
});

// ─── Onboarding UX gate (2026-06-14): defensive gate in handleSend ─────────

describe("useChatActions — send gate (no providers)", () => {
  it("handleSend returns error message when userProviders.length === 0 (single)", () => {
    const setError = vi.fn();
    const mockStartStream = vi.fn();

    const { result } = renderHook(() =>
      useChatActions({
        messages: [],
        setMessages: vi.fn(),
        setError,
        setMultiInfo: vi.fn(),
        setCouncilInfo: vi.fn(),
        setFiles: vi.fn(),
        setInputText: vi.fn(),
        selectedModel: null,
        multiMode: false,
        incognito: false,
        userProviders: [],
        effortSpec: null,
        selectedEffort: "default",
        conversationId: null,
        files: [],
        startStream: mockStartStream,
        stopStream: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("asd");
    });

    expect(setError).toHaveBeenCalledWith(
      expect.stringMatching(/conectá un proveedor/i)
    );
    expect(mockStartStream).not.toHaveBeenCalled();
  });

  it("handleSend returns error message in Consejo mode with <2 providers", () => {
    const setError = vi.fn();
    const mockStartStream = vi.fn();

    const { result } = renderHook(() =>
      useChatActions({
        messages: [],
        setMessages: vi.fn(),
        setError,
        setMultiInfo: vi.fn(),
        setCouncilInfo: vi.fn(),
        setFiles: vi.fn(),
        setInputText: vi.fn(),
        selectedModel: null,
        multiMode: true,
        incognito: false,
        userProviders: [
          { id: "up-1", providerId: "openai", apiKey: "x", maskedKey: "x", options: null, createdAt: "", updatedAt: "" } as any,
        ],
        effortSpec: null,
        selectedEffort: "default",
        conversationId: null,
        files: [],
        startStream: mockStartStream,
        stopStream: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("asd");
    });

    expect(setError).toHaveBeenCalledWith(
      expect.stringMatching(/el consejo necesita al menos 2 providers/i)
    );
    expect(mockStartStream).not.toHaveBeenCalled();
  });
});
