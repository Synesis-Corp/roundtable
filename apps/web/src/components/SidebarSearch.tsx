import { useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getShortcutLabel } from '../lib/keyboard-helpers';
import { SHORTCUT_SEARCH_EVENT } from './KeyboardShortcutsController';

interface SidebarSearchProps {
  searchOpen: boolean;
  searchQuery: string;
  searchInputRef: RefObject<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onToggle: () => void;
}

/**
 * Search control that morphs in place between a button and an input so there is
 * never a second, duplicated field below it. Listens for the global Cmd/Ctrl+K
 * shortcut via the SHORTCUT_SEARCH_EVENT bus (Capability 5).
 */
export function SidebarSearch({
  searchOpen,
  searchQuery,
  searchInputRef,
  onQueryChange,
  onToggle,
}: SidebarSearchProps) {
  const { t } = useTranslation();

  // Global Cmd/Ctrl+K → open the search and focus the input.
  useEffect(() => {
    const onShortcut = () => {
      if (searchOpen) {
        // Already open: just focus the input (no toggle).
        searchInputRef.current?.focus();
      } else {
        onToggle();
        // Focus the input on the next tick (after the morph).
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener(SHORTCUT_SEARCH_EVENT, onShortcut);
    return () => window.removeEventListener(SHORTCUT_SEARCH_EVENT, onShortcut);
  }, [searchOpen, searchInputRef, onToggle]);

  return (
    <nav className="px-3">
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: searchOpen ? 'var(--text-2)' : 'var(--text-3)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>

        {searchOpen ? (
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onToggle();
            }}
            placeholder={t('shell.searchPlaceholder')}
            aria-label={t('shell.searchAria')}
            className="w-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
            style={{
              fontSize: 13,
              padding: '9px 32px 9px 36px',
              borderRadius: 'var(--r-sm)',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--accent-line)',
              color: 'var(--text-1)',
            }}
          />
        ) : (
          <button
            onClick={onToggle}
            aria-expanded={false}
            aria-label={t('shell.searchAria')}
            className="w-full text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)] select-none"
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '9px 12px 9px 36px',
              borderRadius: 'var(--r-sm)',
              backgroundColor: 'transparent',
              color: 'var(--text-2)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('shell.search')}
            <kbd
              data-testid="search-kbd-hint"
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-4)',
                padding: '1px 5px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-surface)',
                cursor: 'pointer',
                lineHeight: 1.4,
                userSelect: 'none',
              }}
            >
              {getShortcutLabel('search')}
            </kbd>
          </button>
        )}

        {searchOpen && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={t('shell.closeSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 focus:outline-none"
            style={{ color: 'var(--text-3)', borderRadius: 'var(--r-xs)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </nav>
  );
}
