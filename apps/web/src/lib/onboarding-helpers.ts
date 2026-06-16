import { storage, type StorageAdapter } from './storage';

// ─── Storage key ─────────────────────────────────────────────────────────────

/** localStorage key that marks a brand-new user (set from the server `created` signal). */
export const IS_NEW_KEY = 'roundtable:is-new';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Copy keys — the persona decision lives in the helper; JSX maps them to text. */
export type OnboardingCopyKey =
  | 'onboarding.copy.new.title'
  | 'onboarding.copy.new.body'
  | 'onboarding.copy.new.cta'
  | 'onboarding.copy.returning.title'
  | 'onboarding.copy.returning.body'
  | 'onboarding.copy.returning.cta';

export interface OnboardingNew {
  kind: 'new';
  titleKey: 'onboarding.copy.new.title';
  bodyKey: 'onboarding.copy.new.body';
  ctaKey: 'onboarding.copy.new.cta';
}

export interface OnboardingReturning {
  kind: 'returning';
  titleKey: 'onboarding.copy.returning.title';
  bodyKey: 'onboarding.copy.returning.body';
  ctaKey: 'onboarding.copy.returning.cta';
}

/** Discriminated union — the full result of the persona decision. */
export type OnboardingState =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | OnboardingNew
  | OnboardingReturning;

export interface OnboardingInput {
  /** `true` only if storage has "roundtable:is-new" === "1". */
  isNewFlag: boolean;
  /** Connected providers for the user (from useSettings). Only `.length` is used. */
  userProviders: ReadonlyArray<unknown>;
  /** useSettings is still loading GET /providers. */
  userProvidersLoading: boolean;
  /** useModels is still loading GET /providers/connected. */
  modelsLoading: boolean;
}

// ─── Pure function ────────────────────────────────────────────────────────────

/**
 * Derives the onboarding persona from primitive inputs.
 * Pure — no side effects, no localStorage access, no React.
 *
 * Precedence (first match wins):
 * 1. Loading gate — prevents flash of wrong content post-registration.
 * 2. Has providers — user is configured; nothing to show.
 * 3. isNewFlag — brand-new user.
 * 4. Default — returning unconfigured user.
 */
export function getOnboardingState(input: OnboardingInput): OnboardingState {
  if (input.userProvidersLoading || input.modelsLoading) {
    return { kind: 'loading' };
  }
  if (input.userProviders.length > 0) {
    return { kind: 'hidden' };
  }
  if (input.isNewFlag) {
    return {
      kind: 'new',
      titleKey: 'onboarding.copy.new.title',
      bodyKey: 'onboarding.copy.new.body',
      ctaKey: 'onboarding.copy.new.cta',
    };
  }
  return {
    kind: 'returning',
    titleKey: 'onboarding.copy.returning.title',
    bodyKey: 'onboarding.copy.returning.body',
    ctaKey: 'onboarding.copy.returning.cta',
  };
}

// ─── Copy map ─────────────────────────────────────────────────────────────────

/**
 * UI copy keys (i18n). The actual strings live in the locale files
 * (`apps/web/src/i18n/locales/{en,es}.json`) under the `onboarding.copy`
 * namespace. JSX consumers call `t(key)` directly — the helper stays free
 * of JSX/React and only exports the key names.
 *
 * Kept as a Record so TypeScript catches typos at compile time (the key
 * passed to `t()` must exist in this list).
 */
export const ONBOARDING_KEYS = {
  'onboarding.copy.new.title': 'onboarding.copy.new.title',
  'onboarding.copy.new.body': 'onboarding.copy.new.body',
  'onboarding.copy.new.cta': 'onboarding.copy.new.cta',
  'onboarding.copy.returning.title': 'onboarding.copy.returning.title',
  'onboarding.copy.returning.body': 'onboarding.copy.returning.body',
  'onboarding.copy.returning.cta': 'onboarding.copy.returning.cta',
} as const satisfies Record<OnboardingCopyKey, string>;

// ─── Flag clear helper ────────────────────────────────────────────────────────

/**
 * Removes `IS_NEW_KEY` from the provided storage adapter (defaults to the
 * app-wide singleton). Idempotent — calling when the key is absent is safe.
 *
 * Used by both `useOnboarding.clearIsNew` (hook) and
 * `useSettings.handleConnect` (success branch), so the key string lives here
 * as a single source of truth.
 */
export function clearIsNewFlag(s: StorageAdapter = storage): void {
  s.remove(IS_NEW_KEY);
}
