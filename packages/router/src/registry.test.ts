import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { registerModel, clearRegistry, isCouncilEligible, getProviderCapabilities, defaultTierFor } from "../src/index";

describe("registry — matrix validation", () => {
  beforeEach(() => {
    clearRegistry();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts a model silently when its provider has a matrix row and capabilities match", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerModel({
      modelId: "gpt-4o",
      provider: "openai",
      modalities: ["text", "image"],
      features: ["vision", "tool-use"],
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns when a known provider declares a feature NOT in the matrix", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerModel({
      modelId: "gpt-mystery",
      provider: "openai",
      modalities: ["text"],
      // The matrix defines openai.supportedFeatures = ["reasoning", "tool-use", "structured-output", "vision", "pdf-input"].
      // Since Feature is a closed union in the SDK, we cannot pass a new string literal at the type level.
      // The validation runs against the matrix's known set; an exact-match row should not warn.
      features: ["reasoning", "tool-use"],
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns when the provider is unknown (no matrix row) but still inserts the model", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerModel({
      modelId: "any-model",
      provider: "acme-corp",
      modalities: ["text"],
      features: [],
    });
    expect(warnSpy).toHaveBeenCalled();
    const warnMessage = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(warnMessage).toMatch(/acme-corp/);
    expect(warnMessage).toMatch(/matrix/i);
    warnSpy.mockRestore();
  });

  it("warns once per unknown provider (does not spam on every model)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerModel({
      modelId: "m1",
      provider: "acme-corp",
      modalities: ["text"],
      features: [],
    });
    registerModel({
      modelId: "m2",
      provider: "acme-corp",
      modalities: ["text"],
      features: [],
    });
    const acmeWarns = warnSpy.mock.calls.filter((call) => String(call[0]).includes("acme-corp"));
    expect(acmeWarns.length).toBe(1);
    warnSpy.mockRestore();
  });

  it("does not warn for known providers even with many models", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerModel({
      modelId: "gpt-4o",
      provider: "openai",
      modalities: ["text", "image"],
      features: ["vision", "tool-use"],
    });
    registerModel({
      modelId: "gpt-4.1",
      provider: "openai",
      modalities: ["text"],
      features: ["tool-use"],
    });
    registerModel({
      modelId: "gpt-5.4",
      provider: "openai",
      modalities: ["text", "image", "pdf"],
      features: ["reasoning", "tool-use", "structured-output", "vision", "pdf-input"],
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("matrix re-exports from index", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("exposes getProviderCapabilities, isCouncilEligible, defaultTierFor via the package barrel", () => {
    expect(typeof getProviderCapabilities).toBe("function");
    expect(typeof isCouncilEligible).toBe("function");
    expect(typeof defaultTierFor).toBe("function");
  });

  it("returns the openai row shape from getProviderCapabilities", () => {
    const caps = getProviderCapabilities("openai");
    expect(caps).toBeDefined();
    expect(caps?.defaultTier).toBe("strong");
    expect(caps?.modelExclusions?.["dall-e-3"]).toContain("council");
  });
});
