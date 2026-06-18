import { type RefObject, useEffect } from 'react';

/**
 * Calls `onOutside` when a `mousedown` event lands outside the element
 * pointed to by `ref`. No-op when `active` is false (so popovers can
 * mount/unmount the listener cleanly).
 */
export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T>,
  onOutside: () => void,
  active: boolean
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside, active]);
}
