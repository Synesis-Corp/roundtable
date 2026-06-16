import { describe, it, expect, beforeEach } from "vitest";
import { registerModel, findCapableModels, clearRegistry, route, getEffortSpec } from "../src/index";

describe("router", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("registers and finds capable models", () => {
    registerModel({
      modelId: "gpt-4o",
      provider: "openai",
      modalities: ["text", "image"],
      features: ["tool-use", "vision"],
    });

    const models = findCapableModels(["text", "image"], ["tool-use"]);
    expect(models).toHaveLength(1);
    expect(models[0].modelId).toBe("gpt-4o");
  });

  it("routes to text fallback when modalities unsupported", () => {
    registerModel({
      modelId: "gpt-4o",
      provider: "openai",
      modalities: ["text"],
      features: [],
    });

    const decision = route({
      messages: [{ role: "user", content: "hello" }],
      model: "gpt-4o",
    });

    expect(decision.primary.modelId).toBe("gpt-4o");
  });

  it("enables multi mode when requested", () => {
    registerModel({
      modelId: "gpt-4o",
      provider: "openai",
      modalities: ["text"],
      features: [],
    });
    registerModel({
      modelId: "claude-3",
      provider: "anthropic",
      modalities: ["text"],
      features: [],
    });

    const decision = route(
      { messages: [{ role: "user", content: "hello" }], model: "gpt-4o" },
      { multiMode: true }
    );

    expect(decision.multiModels).toHaveLength(2);
  });

  it("drops models excluded from 'single' out of default routing", () => {
    registerModel({ modelId: "gpt-4o", provider: "openai", modalities: ["text"], features: [] });
    // Embeddings are excludedFrom every use case in the capability matrix.
    registerModel({
      modelId: "text-embedding-3-small",
      provider: "openai",
      modalities: ["text"],
      features: [],
    });

    const decision = route({ messages: [{ role: "user", content: "hi" }], model: "gpt-4o" });

    const chosen = [decision.primary, ...decision.fallbacks].map((m) => m.modelId);
    expect(decision.primary.modelId).toBe("gpt-4o");
    expect(chosen).not.toContain("text-embedding-3-small");
  });

  it("drops models excluded from 'multi' out of multi mode", () => {
    registerModel({ modelId: "gpt-4o", provider: "openai", modalities: ["text"], features: [] });
    registerModel({ modelId: "claude-3", provider: "anthropic", modalities: ["text"], features: [] });
    registerModel({
      modelId: "text-embedding-3-small",
      provider: "openai",
      modalities: ["text"],
      features: [],
    });

    const decision = route(
      { messages: [{ role: "user", content: "hi" }], model: "gpt-4o" },
      { multiMode: true }
    );

    const multi = decision.multiModels?.map((m) => m.modelId) ?? [];
    expect(multi).not.toContain("text-embedding-3-small");
    expect(multi).toHaveLength(2);
  });

  it("returns model-specific effort variants for OpenAI reasoning models", () => {
    const spec = getEffortSpec("openai", "gpt-5.5", {
      apiId: "gpt-5.5",
      npm: "@ai-sdk/openai",
      reasoning: true,
      releaseDate: "2026-04-23",
      outputLimit: 128000,
    });

    expect(spec?.variants.map((variant) => variant.id)).toContain("none");
    expect(spec?.variants.map((variant) => variant.id)).toContain("minimal");
    expect(spec?.variants.map((variant) => variant.id)).toContain("xhigh");
  });

  it("does not expose manual variants for Kimi/Minimax reasoning models", () => {
    expect(getEffortSpec("kimi-for-coding", "kimi-k2-thinking", {
      apiId: "kimi-k2-thinking",
      npm: "@ai-sdk/anthropic",
      reasoning: true,
      releaseDate: "2025-11",
      outputLimit: 32768,
    })).toBeNull();

    expect(getEffortSpec("minimax-coding-plan", "MiniMax-M2", {
      apiId: "MiniMax-M2",
      npm: "@ai-sdk/anthropic",
      reasoning: true,
      releaseDate: "2025-10-27",
      outputLimit: 128000,
    })).toBeNull();
  });
});
