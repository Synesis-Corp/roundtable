import { useTranslation } from 'react-i18next';

interface ConfirmActionModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Generic confirmation modal for destructive or irreversible actions. */
export function ConfirmActionModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  loading = false,
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t('modal.confirm.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('modal.confirm.cancel');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          maxWidth: 380,
          width: '100%',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>
          {title}
        </h2>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--text-2)',
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              backgroundColor: destructive ? 'var(--m-rose)' : 'var(--accent)',
              color: '#fff',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? t('modal.confirm.processing') : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
