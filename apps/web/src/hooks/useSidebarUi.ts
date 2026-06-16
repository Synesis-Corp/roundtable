import { useState, useRef } from 'react';
import { storage } from '../lib/storage';
import { SIDEBAR_COLLAPSED_KEY } from '../lib/layout-helpers';

/**
 * Owns the sidebar chrome state: the mobile drawer, the persisted desktop
 * collapsed rail, and the in-place search control (button ⇄ input morph).
 */
export function useSidebarUi() {
  // Mobile drawer (overlay).
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop collapsed (rail) — persisted.
  const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(
    () => storage.get(SIDEBAR_COLLAPSED_KEY) === '1'
  );
  // Conversation search. When open, filters the history by title.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleDesktopCollapsed = () => {
    setDesktopCollapsed((v) => {
      const next = !v;
      storage.set(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const toggleSearch = () => {
    setSearchOpen((open) => {
      const next = !open;
      if (!next) setSearchQuery('');
      else setTimeout(() => searchInputRef.current?.focus(), 0);
      return next;
    });
  };

  return {
    mobileOpen,
    setMobileOpen,
    desktopCollapsed,
    toggleDesktopCollapsed,
    searchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    toggleSearch,
  };
}
