import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdmin } from '../hooks/useAdmin';
import { UserMenuPopover } from './UserMenuPopover';

interface SidebarUserCardProps {
  userName: string;
  displayName: string | null;
  onCloseMobile: () => void;
  onLogout: () => void;
}

/**
 * Sidebar footer: single 36px avatar button. Click to open a non-modal
 * popover (UserMenuPopover) with Settings, Admin (if admin), and Logout.
 *
 * Replaces the previous two-card layout (Admin card + Settings card +
 * inline logout icon) with a cleaner single-anchor pattern.
 */
export function SidebarUserCard({
  userName,
  displayName,
  onCloseMobile: _onCloseMobile,
  onLogout,
}: SidebarUserCardProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAdmin();
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const name = displayName || userName || t('shell.userFallback');
  const truncatedName = name.length > 24 ? `${name.slice(0, 24)}…` : name;

  return (
    <div className="relative">
      <button
        ref={avatarRef}
        type="button"
        data-testid="user-menu-avatar"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('shell.userMenu.open')}
        onClick={() => setMenuOpen((v) => !v)}
        className="w-full flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
        style={{
          padding: 6,
          borderRadius: 'var(--r-sm)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <span
          className="shrink-0 flex items-center justify-center font-semibold text-white"
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--r-sm)',
            backgroundColor: 'var(--accent)',
            fontSize: 14,
          }}
        >
          {name ? name[0].toUpperCase() : 'U'}
        </span>
        <span
          className="min-w-0 flex-1 text-left"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {truncatedName}
        </span>
        {isAdmin && (
          <span
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{
              color: 'var(--m-amber)',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
            }}
          >
            Admin
          </span>
        )}
        <svg
          aria-hidden="true"
          className="shrink-0"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          style={{ color: 'var(--text-3)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {menuOpen && (
        <UserMenuPopover
          isAdmin={isAdmin}
          displayName={displayName}
          userName={userName}
          onLogout={onLogout}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
