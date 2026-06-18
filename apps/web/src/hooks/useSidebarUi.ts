import { useState } from 'react';
import { storage } from '../lib/storage';
import { SIDEBAR_COLLAPSED_KEY } from '../lib/layout-helpers';

/**
 * Owns the sidebar chrome state: the mobile drawer, the persisted desktop
 * collapsed rail.
 */
export function useSidebarUi() {
  // Mobile drawer (overlay).
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop collapsed (rail) — persisted.
  const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(
    () => storage.get(SIDEBAR_COLLAPSED_KEY) === '1'
  );
  const toggleDesktopCollapsed = () => {
    setDesktopCollapsed((v) => {
      const next = !v;
      storage.set(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  return {
    mobileOpen,
    setMobileOpen,
    desktopCollapsed,
    toggleDesktopCollapsed,
  };
}
