import { useTranslation } from 'react-i18next';

interface RenameModalProps {
  renameValue: string;
  renaming: boolean;
  regeneratingTitle: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRegenerateTitle: () => void;
}

/** Rename modal for a conversation, with optional AI title regeneration. */
export function RenameModal({
  renameValue,
  renaming,
  regeneratingTitle,
  onChange,
  onCancel,
  onConfirm,
  onRegenerateTitle,
}: RenameModalProps) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => {
        if (!renaming) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('modal.rename.aria')}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          maxWidth: 420,
          width: '100%',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>
          {t('modal.rename.title')}
        </h2>
        <input
          autoFocus
          value={renameValue}
          maxLength={200}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          style={{
            width: '100%',
            fontSize: 14,
            padding: '9px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border-strong)',
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-1)',
            marginBottom: 20,
            outline: 'none',
          }}
        />
        <div
          style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}
        >
          <button
            type="button"
            onClick={onRegenerateTitle}
            disabled={renaming || regeneratingTitle}
            title={t('modal.rename.regenerateTitle')}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 12px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--accent-line)',
              backgroundColor: 'var(--accent-quiet)',
              color: 'var(--accent-text)',
              opacity: renaming || regeneratingTitle ? 0.7 : 1,
              cursor: renaming || regeneratingTitle ? 'default' : 'pointer',
            }}
          >
            {regeneratingTitle ? (
              t('modal.rename.regenerating')
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l1.9 5.7 5.7 1.9-5.7 1.9L12 18.2l-1.9-5.7L4.4 10.6l5.7-1.9L12 3z" />
                  <path d="M19 14l.7 2 2 .7-2 .7L19 19.5l-.7-2-2-.7 2-.7L19 14zM5 14l.7 2 2 .7-2 .7L5 19.5l-.7-2-2-.7 2-.7L5 14z" />
                </svg>
                {t('modal.rename.regenerateWithAi')}
              </span>
            )}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={renaming}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: '8px 14px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--text-2)',
                cursor: renaming ? 'default' : 'pointer',
              }}
            >
              {t('modal.rename.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={renaming || !renameValue.trim()}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                opacity: renaming || !renameValue.trim() ? 0.7 : 1,
                cursor: renaming || !renameValue.trim() ? 'default' : 'pointer',
              }}
            >
              {renaming ? t('modal.rename.saving') : t('modal.rename.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
