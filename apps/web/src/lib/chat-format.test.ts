import { describe, it, expect } from "vitest";
import { formatEffortLabel, parseSelectedModel } from "./chat-format";

describe("formatEffortLabel", () => {
  it("maps 'default' to 'Default'", () => {
    expect(formatEffortLabel("default")).toBe("Default");
  });

  it("returns other values unchanged", () => {
    expect(formatEffortLabel("high")).toBe("high");
  });
});

describe("parseSelectedModel", () => {
  it("splits provider and modelId", () => {
    expect(parseSelectedModel("openai:gpt-4o")).toEqual({
      provider: "openai",
      modelId: "gpt-4o",
    });
  });

  it("keeps a colon inside the modelId portion", () => {
    expect(parseSelectedModel("anthropic:claude-3:latest")).toEqual({
      provider: "anthropic",
      modelId: "claude-3:latest",
    });
  });

  it("returns null when there is no separator", () => {
    expect(parseSelectedModel("gpt-4o")).toBeNull();
  });

  it("returns null when the separator is at an edge", () => {
    expect(parseSelectedModel(":gpt-4o")).toBeNull();
    expect(parseSelectedModel("openai:")).toBeNull();
  });
});
