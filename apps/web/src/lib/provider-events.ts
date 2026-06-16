/**
 * Cross-hook event for "the user's connected provider set changed".
 *
 * Emitted by `useSettings` after a successful connect, disconnect, or
 * Codex OAuth callback. Subscribed by `useModels` so the visible model
 * list stays in sync without relying on route-level remounts.
 *
 * Why a window CustomEvent and not a shared store: the project has no
 * zustand/React Query. Both hooks are mounted independently (in three
 * different components for useModels alone), with no shared parent to
 * thread props through. The bus is the minimal coupling. Naming follows
 * the existing convention (`roundtable:new-chat`, `roundtable:is-new`).
 */
export const PROVIDERS_CHANGED_EVENT = "roundtable:providers-changed";

/** Dispatches {@link PROVIDERS_CHANGED_EVENT} on `window`. */
export function emitProvidersChanged(): void {
  window.dispatchEvent(new CustomEvent(PROVIDERS_CHANGED_EVENT));
}
