/**
 * Pure keyboard-shortcut helpers.
 *
 * Why a dedicated module: the project has two global shortcuts (Cmd/Ctrl+K for
 * the sidebar search, `/` for the composer) and the platform modifier differs
 * between Mac and non-Mac. Centralising the logic here keeps the
 * KeyboardShortcutsController and the kbd hint chip in sync, and gives us
 * a single place to test the platform branches.
 */
const MAC_UA_FRAGMENT = 'Mac';

/** True when the current browser identifies as a Mac. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return navigator.userAgent.includes(MAC_UA_FRAGMENT);
}

/**
 * True when the event matches the given key using the platform-correct
 * modifier. Cmd on Mac, Ctrl elsewhere. The key match is case-insensitive
 * (event.key is normalised to lower-case in tests, but real KeyboardEvent
 * values vary: "k" or "K").
 */
export function matchesShortcut(event: KeyboardEvent, key: string): boolean {
  const modifier = isMac() ? event.metaKey : event.ctrlKey;
  // For '/' the modifier must be ABSENT; for everything else the modifier
  // must be present.
  if (key === '/') {
    return !event.metaKey && !event.ctrlKey && event.key === '/';
  }
  return modifier && event.key.toLowerCase() === key.toLowerCase();
}

/** User-facing label for a shortcut kind. Mac shows the ⌘ glyph. */
export function getShortcutLabel(kind: 'search' | 'composer'): string {
  if (kind === 'composer') return '/';
  return isMac() ? '⌘K' : 'Ctrl K';
}
