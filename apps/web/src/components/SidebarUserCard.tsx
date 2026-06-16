import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { useAdmin } from '../hooks/useAdmin';

interface SidebarUserCardProps {
  userName: string;
  conversationCount: number;
  onCloseMobile: () => void;
  onLogout: () => void;
}

/** Sidebar footer card: avatar, username, conversation count, logout. */
export function SidebarUserCard({
  userName,
  conversationCount,
  onCloseMobile,
  onLogout,
}: SidebarUserCardProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAdmin();
  return (
    <div className="space-y-2">
      <div className="flex justify-end px-1">
        <LanguageSwitcher />
      </div>
      {isAdmin && (
        <Link
          to="/admin"
          onClick={onCloseMobile}
          className="flex items-center gap-3 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
          style={{
            padding: 12,
            borderRadius: 'var(--r-md)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
          }}
        >
          <div
            className="flex shrink-0 items-center justify-center text-sm font-semibold text-white"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--r-sm)',
              background: 'linear-gradient(150deg, #f59e0b, #ef4444 70%)',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}
            >
              {t('shell.adminLink')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('admin.title')}</div>
          </div>
        </Link>
      )}
      <Link
        to="/settings"
        onClick={onCloseMobile}
        className="flex items-center gap-3 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
        style={{
          padding: 12,
          borderRadius: 'var(--r-md)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border-strong)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center text-sm font-semibold text-white"
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--r-sm)',
            background: 'linear-gradient(150deg, #5b91d6, #7c6cf0 70%)',
          }}
        >
          {userName ? userName[0].toUpperCase() : 'U'}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}
          >
            {userName || t('shell.userFallback')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {t('shell.conversationCount', { count: conversationCount })}
          </div>
        </div>
        {/* Logout icon button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLogout();
          }}
          className="shrink-0 p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
          style={{ color: 'var(--text-3)', borderRadius: 'var(--r-xs)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
          title={t('shell.logout')}
          aria-label={t('shell.logout')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </Link>
    </div>
  );
}
