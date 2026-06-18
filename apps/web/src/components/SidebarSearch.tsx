import { useTranslation } from 'react-i18next';
import { getShortcutLabel } from '../lib/keyboard-helpers';
import { SHORTCUT_SEARCH_EVENT } from './KeyboardShortcutsController';

/** Sidebar search is now a trigger for the global SearchOverlay, not an inline input. */
export function SidebarSearch() {
  const { t } = useTranslation();

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent(SHORTCUT_SEARCH_EVENT));
  };

  return (
    <nav className="px-3">
      <button
        type="button"
        onClick={openSearch}
        aria-label={t('search.aria')}
        className="relative w-full text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)] select-none"
        style={{
          fontSize: 13,
          fontWeight: 500,
          padding: '9px 12px 9px 36px',
          borderRadius: 'var(--r-sm)',
          backgroundColor: 'transparent',
          color: 'var(--text-2)',
          border: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-1)';
          e.currentTarget.style.backgroundColor = 'var(--hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-2)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-3)' }}
          aria-hidden="true"
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
        {t('shell.search')}
        <kbd
          data-testid="search-kbd-hint"
          aria-hidden="true"
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
            lineHeight: 1.4,
            userSelect: 'none',
          }}
        >
          {getShortcutLabel('search')}
        </kbd>
      </button>
    </nav>
  );
}
