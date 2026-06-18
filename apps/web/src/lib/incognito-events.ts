/**
 * Cross-hook event for "incognito mode toggled".
 *
 * Emitted by ChatPage (and the new IncognitoTopBar) on every transition.
 * Subscribed by ConversationList so the sidebar can dim its conversation
 * list and render a notice without going through prop drilling.
 *
 * Why a window CustomEvent and not a shared store: the project has no
 * zustand/React Query. ChatPage and ConversationList are mounted in
 * disjoint sub-trees (Layout owns the sidebar, ChatPage owns the column),
 * with no shared parent to thread props through. The bus is the minimal
 * coupling. Naming follows the existing convention (`roundtable:providers-changed`,
 * `roundtable:new-chat`).
 */
import { useEffect, useState } from 'react';

export const INCOGNITO_CHANGED_EVENT = 'roundtable:incognito-changed';

/** Dispatches {@link INCOGNITO_CHANGED_EVENT} on `window` with the new state. */
export function emitIncognitoChanged(active: boolean): void {
  window.dispatchEvent(new CustomEvent(INCOGNITO_CHANGED_EVENT, { detail: { active } }));
}

/**
 * React hook that subscribes to the incognito bus and returns the latest
 * value. Defaults to `false` until the first event arrives.
 */
export function useIncognitoFromBus(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      if (detail && typeof detail.active === 'boolean') setActive(detail.active);
    };
    window.addEventListener(INCOGNITO_CHANGED_EVENT, handler);
    return () => window.removeEventListener(INCOGNITO_CHANGED_EVENT, handler);
  }, []);
  return active;
}
