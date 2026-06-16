import { describe, it, expect } from "vitest";
import { getProvider } from "./provider-registry";

describe("getProvider — Codex OAuth wiring", () => {
  it("returns a configured OpenAI provider for Codex credentials (does not throw)", () => {
    const provider = getProvider("openai", {
      authType: "codex",
      baseURL: "https://chatgpt.com/backend-api/codex",
    });

    expect(provider).toBeDefined();
    expect(provider?.id).toBe("openai");
    // The provider must expose the methods the chat pipeline calls.
    expect(typeof provider?.streamChat).toBe("function");
    expect(typeof provider?.chat).toBe("function");
  });

  it("returns a configured OpenAI provider for plain API-key credentials (does not throw)", () => {
    const provider = getProvider("openai", {
      baseURL: "https://api.openai.com/v1",
    });

    expect(provider).toBeDefined();
    expect(provider?.id).toBe("openai");
    expect(typeof provider?.streamChat).toBe("function");
    expect(typeof provider?.chat).toBe("function");
  });

  it("accepts null organization and project in the Codex path (no undefined-leak)", () => {
    // The Codex path passes organization: null and project: null. If the
    // provider tried to forward these to the AI SDK as undefined, the
    // SDK would serialize the literal string "undefined" in the
    // OpenAI-Organization / OpenAI-Project headers and ChatGPT would reject
    // the request. This test just ensures the construction path doesn't
    // throw when those fields are null. The behavioral verification of
    // header hygiene lives in api.test.ts.
    expect(() =>
      getProvider("openai", {
        authType: "codex",
        baseURL: "https://chatgpt.com/backend-api/codex",
        organization: null,
        project: null,
      }),
    ).not.toThrow();
  });
});
