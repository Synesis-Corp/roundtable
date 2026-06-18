import { useEffect } from 'react';
import { matchesShortcut } from '../lib/keyboard-helpers';
import { useComposerFocus } from '../lib/composer-focus';

/** Custom event names dispatched by the controller. */
export const SHORTCUT_SEARCH_EVENT = 'roundtable:shortcut-search';

/**
 * Global keyboard shortcuts. One controller, one capture-phase listener.
 * Mounts at the Layout level. No props, no DOM output.
 *
 * Shortcuts:
 * - Cmd/Ctrl+K → dispatches `roundtable:shortcut-search` (SidebarSearch listens).
 * - `/` (outside text-entry elements) → focuses the composer.
 */
export function KeyboardShortcutsController() {
  const composerRef = useComposerFocus();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K → search
      if (matchesShortcut(e, 'k')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(SHORTCUT_SEARCH_EVENT));
        return;
      }
      // "/" → focus composer (skip when in a text-entry element)
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        const active = document.activeElement as HTMLElement | null;
        if (active) {
          const tag = active.tagName;
          const isTextEntry =
            tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
          if (isTextEntry) return;
        }
        e.preventDefault();
        composerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [composerRef]);

  return null;
}
