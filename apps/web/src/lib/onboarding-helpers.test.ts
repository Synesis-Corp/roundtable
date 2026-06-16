import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "./storage";
import {
  IS_NEW_KEY,
  getOnboardingState,
  clearIsNewFlag,
} from "./onboarding-helpers";

// ─── IS_NEW_KEY constant ─────────────────────────────────────────────────────

describe("IS_NEW_KEY", () => {
  it('is exported as "roundtable:is-new"', () => {
    expect(IS_NEW_KEY).toBe("roundtable:is-new");
  });
});

// ─── getOnboardingState ───────────────────────────────────────────────────────

describe("getOnboardingState", () => {
  describe("loading gate — takes priority over all other rules", () => {
    it("returns loading when userProvidersLoading is true (even with isNewFlag=true and empty providers)", () => {
      const result = getOnboardingState({
        isNewFlag: true,
        userProviders: [],
        userProvidersLoading: true,
        modelsLoading: false,
      });
      expect(result.kind).toBe("loading");
    });

    it("returns loading when modelsLoading is true (even with isNewFlag=false and empty providers)", () => {
      const result = getOnboardingState({
        isNewFlag: false,
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: true,
      });
      expect(result.kind).toBe("loading");
    });

    it("returns loading when both loading flags are true", () => {
      const result = getOnboardingState({
        isNewFlag: true,
        userProviders: [],
        userProvidersLoading: true,
        modelsLoading: true,
      });
      expect(result.kind).toBe("loading");
    });
  });

  describe("hidden gate — providers present beats flag", () => {
    it("returns hidden when providers array is non-empty (isNewFlag=false)", () => {
      const result = getOnboardingState({
        isNewFlag: false,
        userProviders: [{ providerId: "openai" }],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("hidden");
    });

    it("returns hidden when providers array is non-empty (isNewFlag=true — length gate wins)", () => {
      const result = getOnboardingState({
        isNewFlag: true,
        userProviders: [{ providerId: "openai" }],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("hidden");
    });
  });

  describe("new persona — flag true, no providers, not loading", () => {
    it("returns kind=new when isNewFlag is true and providers are empty", () => {
      const result = getOnboardingState({
        isNewFlag: true,
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("new");
    });

    it("new result carries the correct copy keys", () => {
      const result = getOnboardingState({
        isNewFlag: true,
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("new");
      if (result.kind === "new") {
        expect(result.titleKey).toBe("onboarding.new.title");
        expect(result.bodyKey).toBe("onboarding.new.body");
        expect(result.ctaKey).toBe("onboarding.new.cta");
      }
    });
  });

  describe("returning persona — flag false, no providers, not loading", () => {
    it("returns kind=returning when isNewFlag is false and providers are empty", () => {
      const result = getOnboardingState({
        isNewFlag: false,
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("returning");
    });

    it("returning result carries the correct copy keys", () => {
      const result = getOnboardingState({
        isNewFlag: false,
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("returning");
      if (result.kind === "returning") {
        expect(result.titleKey).toBe("onboarding.returning.title");
        expect(result.bodyKey).toBe("onboarding.returning.body");
        expect(result.ctaKey).toBe("onboarding.returning.cta");
      }
    });

    it("returns returning when flag was cleared (soft nudge, never broken state)", () => {
      // Edge case: storage cleared before connecting a provider
      const result = getOnboardingState({
        isNewFlag: false,
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      });
      expect(result.kind).toBe("returning");
    });
  });
});

// ─── clearIsNewFlag ───────────────────────────────────────────────────────────

describe("clearIsNewFlag", () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
  });

  it("removes IS_NEW_KEY from the provided adapter", () => {
    adapter.set(IS_NEW_KEY, "1");
    expect(adapter.get(IS_NEW_KEY)).toBe("1");

    clearIsNewFlag(adapter);

    expect(adapter.get(IS_NEW_KEY)).toBeNull();
  });

  it("is idempotent — calling it twice does not throw", () => {
    adapter.set(IS_NEW_KEY, "1");
    clearIsNewFlag(adapter);
    expect(() => clearIsNewFlag(adapter)).not.toThrow();
    expect(adapter.get(IS_NEW_KEY)).toBeNull();
  });

  it("is a no-op when the key is already absent", () => {
    expect(adapter.get(IS_NEW_KEY)).toBeNull();
    expect(() => clearIsNewFlag(adapter)).not.toThrow();
    expect(adapter.get(IS_NEW_KEY)).toBeNull();
  });
});
