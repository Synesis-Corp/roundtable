import { describe, it, expect } from "vitest";
import { filterActiveModels, validateActiveModelIds } from "./active-models";
import type { ModelInfo } from "../services/model-registry";

function model(provider: string, id: string): ModelInfo {
  return { id, name: id, provider, description: "", contextWindow: 1000, capabilities: [] };
}

describe("filterActiveModels (#1 — per-provider active models)", () => {
  const models = [
    model("openai", "gpt-5.4"),
    model("openai", "gpt-5.4-mini"),
    model("anthropic", "claude-4"),
  ];

  it("shows ALL models when there is no config", () => {
    expect(filterActiveModels(models, new Map())).toHaveLength(3);
  });

  it("keeps only the allow-listed models of a configured provider", () => {
    const active = new Map([["openai", ["gpt-5.4"]]]);
    const result = filterActiveModels(models, active);
    // openai filtered to gpt-5.4; anthropic untouched (no config → all shown).
    expect(result.map((m) => m.id).sort()).toEqual(["claude-4", "gpt-5.4"]);
  });

  it("leaves providers without a config fully visible", () => {
    const active = new Map([["openai", ["gpt-5.4-mini"]]]);
    const result = filterActiveModels(models, active);
    expect(result.some((m) => m.provider === "anthropic" && m.id === "claude-4")).toBe(true);
    expect(result.some((m) => m.id === "gpt-5.4")).toBe(false);
  });

  it("treats an empty allow-list as 'show all' (defensive, never hides everything)", () => {
    const active = new Map([["openai", []]]);
    expect(filterActiveModels(models, active)).toHaveLength(3);
  });
});

describe("validateActiveModelIds (#1 — PUT validation)", () => {
  it("accepts an array of non-empty strings", () => {
    const result = validateActiveModelIds(["gpt-5.4", "gpt-5.4-mini"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.modelIds).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
  });

  it("accepts an empty array (means: reset to show all)", () => {
    const result = validateActiveModelIds([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(validateActiveModelIds("gpt-5.4").ok).toBe(false);
    expect(validateActiveModelIds(undefined).ok).toBe(false);
  });

  it("rejects non-string or empty elements", () => {
    expect(validateActiveModelIds(["ok", ""]).ok).toBe(false);
    expect(validateActiveModelIds(["ok", 42]).ok).toBe(false);
  });

  it("rejects an absurdly large list", () => {
    const huge = Array.from({ length: 201 }, (_, i) => `m${i}`);
    expect(validateActiveModelIds(huge).ok).toBe(false);
  });

  it("de-duplicates while preserving order", () => {
    const result = validateActiveModelIds(["a", "b", "a"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.modelIds).toEqual(["a", "b"]);
  });
});
