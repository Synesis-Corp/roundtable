import { useTranslation } from 'react-i18next';

interface IncognitoTopBarProps {
  /** Called when the user clicks the X button or presses Esc on the bar. */
  onExit: () => void;
  /** Optional className to extend the outer container. */
  className?: string;
}

/**
 * Dedicated top bar shown inside the chat column when incognito is active.
 * Replaces the small chip in the messages topbar; the inline banner in the
 * composer stays (additive — see the spec for Capability 2).
 *
 * The bar is a calm, full-width amber tint (NOT a saturated fill) so the
 * user knows the page-state is private without making the UI shout.
 */
export function IncognitoTopBar({ onExit, className }: IncognitoTopBarProps) {
  const { t } = useTranslation();
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div
      data-testid="incognito-top-bar"
      role="status"
      aria-live="polite"
      className={`${className ?? ''} select-none`.trim()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onExit();
      }}
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        backgroundColor: 'rgba(245, 158, 11, 0.06)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.18)',
        color: 'var(--m-amber)',
        fontSize: 13,
        fontWeight: 500,
        // Motion: 200ms in / 150ms out, suppressed under reduced-motion.
        transition: reduceMotion ? 'opacity 0s, transform 0s' : 'opacity 200ms, transform 200ms',
      }}
    >
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--m-amber)' }}
      >
        {/* Eye-slash icon (currentColor so the amber cascades from the span). */}
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5C5.4 7.8 8.4 6 12 6s6.6 1.8 9 5.5c-2.4 3.7-5.4 5.5-9 5.5s-6.6-1.8-9-5.5Z" />
          <path d="m4 4 16 16" />
        </svg>
        <span>{t('chat.incognitoBar.label')}</span>
      </span>
      <button
        type="button"
        aria-label={t('chat.incognitoBar.exit')}
        onClick={onExit}
        className="rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--m-amber)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
        style={{
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--m-amber)',
          fontSize: 18,
          lineHeight: 1,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(245, 158, 11, 0.12)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        ×
      </button>
    </div>
  );
}
