import { useTranslation } from 'react-i18next';
import { QUICK_ACTIONS } from '../lib/chat-page-helpers';
import type { QuickAction } from '../lib/chat-page-helpers';

interface QuickActionsProps {
  onSelect: (prefix: string) => void;
}

/**
 * Build the tinted icon container style. Idle = 12% alpha of the token,
 * hover = 18% alpha. Using `color-mix` keeps the relationship between
 * the tint and the token explicit (no hard-coded RGBA channels).
 */
function tintedBg(token: QuickAction['iconColorToken']): string {
  return `color-mix(in oklch, var(${token}), transparent 88%)`;
}

export function QuickActions({ onSelect }: QuickActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6 select-none">
      {QUICK_ACTIONS.map((a) => (
        <button
          key={a.labelKey}
          onClick={() => onSelect(t(a.prefixKey))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)] active:scale-95 select-none"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-pill)',
            color: 'var(--text-3)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
            // Also lift the icon container's tint from 12% to 18%.
            const wrap = e.currentTarget.querySelector(
              'span[data-icon-wrap]'
            ) as HTMLElement | null;
            if (wrap)
              wrap.style.backgroundColor = `color-mix(in oklch, var(${a.iconColorToken}), transparent 82%)`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
            const wrap = e.currentTarget.querySelector(
              'span[data-icon-wrap]'
            ) as HTMLElement | null;
            if (wrap) wrap.style.backgroundColor = tintedBg(a.iconColorToken);
          }}
        >
          <span
            data-icon-wrap
            className="inline-flex items-center justify-center shrink-0"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              backgroundColor: tintedBg(a.iconColorToken),
              color: `var(${a.iconColorToken})`,
            }}
          >
            {a.icon}
          </span>
          <span>{t(a.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

const DELIBERATION_STEP_KEYS = [
  'chat.deliberation.propose',
  'chat.deliberation.debate',
  'chat.deliberation.vote',
  'chat.deliberation.synthesize',
] as const;

export function DeliberationSteps() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
      {DELIBERATION_STEP_KEYS.map((key, i) => {
        const label = t(key);
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="inline-flex items-center text-[13px]"
              style={{
                color: 'var(--text-3)',
              }}
            >
              {label}
            </span>
            {i < DELIBERATION_STEP_KEYS.length - 1 && (
              <svg
                className="w-3 h-3"
                style={{ color: 'var(--text-4)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
