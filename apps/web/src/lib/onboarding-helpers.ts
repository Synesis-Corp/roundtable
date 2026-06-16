import { storage, type StorageAdapter } from "./storage";

// ─── Storage key ─────────────────────────────────────────────────────────────

/** localStorage key that marks a brand-new user (set from the server `created` signal). */
export const IS_NEW_KEY = "roundtable:is-new";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Copy keys — the persona decision lives in the helper; JSX maps them to text. */
export type OnboardingCopyKey =
  | "onboarding.new.title"
  | "onboarding.new.body"
  | "onboarding.new.cta"
  | "onboarding.returning.title"
  | "onboarding.returning.body"
  | "onboarding.returning.cta";

export interface OnboardingNew {
  kind: "new";
  titleKey: "onboarding.new.title";
  bodyKey: "onboarding.new.body";
  ctaKey: "onboarding.new.cta";
}

export interface OnboardingReturning {
  kind: "returning";
  titleKey: "onboarding.returning.title";
  bodyKey: "onboarding.returning.body";
  ctaKey: "onboarding.returning.cta";
}

/** Discriminated union — the full result of the persona decision. */
export type OnboardingState =
  | { kind: "hidden" }
  | { kind: "loading" }
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
    return { kind: "loading" };
  }
  if (input.userProviders.length > 0) {
    return { kind: "hidden" };
  }
  if (input.isNewFlag) {
    return {
      kind: "new",
      titleKey: "onboarding.new.title",
      bodyKey: "onboarding.new.body",
      ctaKey: "onboarding.new.cta",
    };
  }
  return {
    kind: "returning",
    titleKey: "onboarding.returning.title",
    bodyKey: "onboarding.returning.body",
    ctaKey: "onboarding.returning.cta",
  };
}

// ─── Copy map ─────────────────────────────────────────────────────────────────

/**
 * UI copy strings keyed by `OnboardingCopyKey`.
 *
 * All strings live here (single source) so JSX components never inline literal
 * copy that could diverge. The helper stays free of JSX/React — it only exports
 * plain strings.
 */
export const ONBOARDING_COPY: Record<OnboardingCopyKey, string> = {
  "onboarding.new.title": "Conecta tu primer proveedor para empezar",
  "onboarding.new.body":
    "Roundtable necesita una clave de API para hablar con los modelos. Añádela en Proveedores y empieza a trabajar.",
  "onboarding.new.cta": "Ir a Proveedores →",
  "onboarding.returning.title": "Todavía no tienes proveedores conectados",
  "onboarding.returning.body":
    "Sin un proveedor activo no puedes enviar mensajes. Conéctate ahora y todo estará listo.",
  "onboarding.returning.cta": "Ir a Proveedores →",
};

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
