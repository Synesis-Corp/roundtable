import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageAdapter, MemoryStorageAdapter } from "./storage";

describe("MemoryStorageAdapter", () => {
  it("returns null for a missing key", () => {
    const s = new MemoryStorageAdapter();
    expect(s.get("missing")).toBeNull();
  });

  it("round-trips set → get", () => {
    const s = new MemoryStorageAdapter();
    s.set("token", "abc");
    expect(s.get("token")).toBe("abc");
  });

  it("remove deletes the key", () => {
    const s = new MemoryStorageAdapter();
    s.set("k", "v");
    s.remove("k");
    expect(s.get("k")).toBeNull();
  });
});

describe("LocalStorageAdapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("round-trips through window.localStorage when available", () => {
    const s = new LocalStorageAdapter();
    s.set("token", "abc");
    expect(s.get("token")).toBe("abc");
    expect(window.localStorage.getItem("token")).toBe("abc");
  });

  it("remove clears the underlying key", () => {
    const s = new LocalStorageAdapter();
    s.set("k", "v");
    s.remove("k");
    expect(window.localStorage.getItem("k")).toBeNull();
  });

  it("falls back to memory when setItem throws (quota exceeded)", () => {
    const s = new LocalStorageAdapter();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    // Should NOT throw — falls back to memory transparently.
    expect(() => s.set("big", "value")).not.toThrow();
    // Value is retrievable from the in-memory fallback…
    expect(s.get("big")).toBe("value");
    // …but never reached real localStorage.
    spy.mockRestore();
    expect(window.localStorage.getItem("big")).toBeNull();
  });

  it("falls back to memory when localStorage access throws on read", () => {
    const s = new LocalStorageAdapter();
    s.set("k", "v"); // stored in real localStorage
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });
    // Returns null instead of throwing.
    expect(s.get("k")).toBeNull();
  });
});
