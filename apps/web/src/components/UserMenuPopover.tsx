import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOutsideClick } from '../hooks/use-outside-click';

interface UserMenuPopoverProps {
  isAdmin: boolean;
  displayName: string | null;
  userName: string;
  onLogout: () => void;
  /** Called when the popover should close (Esc, outside click, item click). */
  onClose?: () => void;
}

/**
 * HTML Popover API menu attached to the sidebar user avatar. Non-modal,
 * no backdrop. Keyboard nav (↑/↓/Home/End) inside. The anchor element
 * is the first sibling — `useOutsideClick` uses `useRef` to the popover
 * element so clicks inside don't close.
 */
export function UserMenuPopover({
  isAdmin,
  displayName,
  userName,
  onLogout,
  onClose,
}: UserMenuPopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  useOutsideClick(popoverRef, () => onClose?.(), true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      const popover = popoverRef.current;
      if (!popover) return;
      const items = Array.from(popover.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const idx = items.findIndex((el) => el === document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      role="menu"
      aria-label={t('shell.userMenu.open')}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        minWidth: 180,
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 4,
        zIndex: 50,
      }}
    >
      <Link
        to="/settings"
        role="menuitem"
        onClick={() => onClose?.()}
        className="block w-full text-left px-3 py-2 rounded transition-colors focus:outline-none"
        style={{ color: 'var(--text-1)', fontSize: 13 }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
        }}
      >
        {t('shell.userMenu.settings')}
      </Link>
      {isAdmin && (
        <Link
          to="/admin"
          role="menuitem"
          onClick={() => onClose?.()}
          aria-label={t('shell.userMenu.admin')}
          className="block w-full text-left px-3 py-2 rounded transition-colors focus:outline-none"
          style={{ color: 'var(--text-1)', fontSize: 13 }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
          }}
        >
          {t('shell.userMenu.admin')}
        </Link>
      )}
      <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onLogout();
          onClose?.();
        }}
        className="w-full text-left px-3 py-2 rounded transition-colors focus:outline-none"
        style={{ color: 'var(--m-rose)', fontSize: 13, background: 'transparent', border: 'none' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        {t('shell.userMenu.logout')}
      </button>
      {/* Suppress unused-var for userName/displayName: this component is
          always rendered alongside the avatar which already shows the
          name. The props are kept for future expansion (e.g. badge with
          displayName inside the menu). */}
      <span hidden data-user-name={userName} data-display-name={displayName ?? ''} />
    </div>
  );
}
