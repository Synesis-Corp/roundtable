import { useTranslation } from 'react-i18next';
import type { PromptSuggestion, PromptSuggestionKind } from '../lib/prompt-suggestions';

interface PromptSuggestionsProps {
  suggestions: PromptSuggestion[];
  /** Inject the (localized) full prompt into the composer. */
  onSelect: (prompt: string) => void;
}

/** Map each heuristic kind to its visible-label and injected-prompt i18n keys. */
const KEYS: Record<PromptSuggestionKind, { label: string; prompt: string }> = {
  continue: { label: 'chat.suggestions.continueLabel', prompt: 'chat.suggestions.continuePrompt' },
  summarize: {
    label: 'chat.suggestions.summarizeLabel',
    prompt: 'chat.suggestions.summarizePrompt',
  },
};

/**
 * Contextual prompt suggestions (#3) — a dynamic row derived from the user's
 * recent conversations. Renders nothing when there are no suggestions, so the
 * static QuickActions stay the sole empty-state affordance for new users.
 */
export function PromptSuggestions({ suggestions, onSelect }: PromptSuggestionsProps) {
  const { t } = useTranslation();
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-6 select-none">
      <p
        className="text-center mb-2"
        style={{ fontSize: 11, color: 'var(--text-4)', letterSpacing: '0.02em' }}
      >
        {t('chat.suggestions.label')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => {
          const keys = KEYS[s.kind];
          return (
            <button
              key={s.key}
              onClick={() => onSelect(t(keys.prompt, { title: s.title }))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)] active:scale-95 select-none"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-pill)',
                color: 'var(--text-3)',
                maxWidth: '20rem',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
              }}
            >
              <span className="truncate">{t(keys.label, { title: s.title })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
