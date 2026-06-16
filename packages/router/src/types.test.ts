import { describe, it, expect } from 'vitest';
import type { Feature } from '@chat/sdk';

/**
 * Runtime-introspectable list of Feature values.
 *
 * TypeScript unions are not introspectable at runtime, so we maintain a const
 * array alongside the type. The shape MUST match `Feature` in @chat/sdk.
 *
 * If you add/remove a value, update BOTH:
 *   1. `Feature` in packages/sdk/src/types.ts
 *   2. `FEATURE_VALUES` below
 */
const FEATURE_VALUES: readonly Feature[] = [
  'reasoning',
  'tool-use',
  'structured-output',
  'vision',
  'pdf-input',
];

describe('Feature enum', () => {
  it('has exactly 5 values', () => {
    expect(FEATURE_VALUES).toHaveLength(5);
  });

  it('contains the expected semantic values', () => {
    expect([...FEATURE_VALUES].sort()).toEqual(
      ['pdf-input', 'reasoning', 'structured-output', 'tool-use', 'vision'].sort()
    );
  });

  it("does NOT contain the legacy 'code' or 'long-context' values", () => {
    expect(FEATURE_VALUES).not.toContain('code');
    expect(FEATURE_VALUES).not.toContain('long-context');
  });

  it('is a valid Feature[] (TypeScript would reject mismatches at compile time)', () => {
    // This compiles only if every entry is a valid Feature. The const-array
    // annotation IS the compile-time pin.
    const pinned: readonly Feature[] = FEATURE_VALUES;
    expect(pinned).toBe(FEATURE_VALUES);
  });
});

describe('Feature enum — compile-time guards', () => {
  it("rejects the legacy 'code' value at compile time", () => {
    // The @ts-expect-error on the line below asserts that the new enum does
    // NOT include "code". If a future refactor adds it back, TypeScript will
    // stop reporting the error and the @ts-expect-error will fail.
    // @ts-expect-error — "code" is no longer a valid Feature (replaced by "tool-use")
    const _broken: Feature = 'code';
    expect(_broken).toBeDefined();
  });

  it("rejects the legacy 'long-context' value at compile time", () => {
    // @ts-expect-error — "long-context" is no longer a valid Feature (replaced by "structured-output")
    const _broken: Feature = 'long-context';
    expect(_broken).toBeDefined();
  });
});
