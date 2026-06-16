import { useTranslation } from 'react-i18next';

interface ConfirmDeleteModalProps {
  title: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Soft-delete confirmation modal for a conversation. */
export function ConfirmDeleteModal({
  title,
  deleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('modal.delete.aria')}
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
          {t('modal.delete.title')}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
          {t('modal.delete.body', { title })}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--text-2)',
              cursor: deleting ? 'default' : 'pointer',
            }}
          >
            {t('modal.delete.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              backgroundColor: 'var(--m-rose)',
              color: '#fff',
              opacity: deleting ? 0.7 : 1,
              cursor: deleting ? 'default' : 'pointer',
            }}
          >
            {deleting ? t('modal.delete.deleting') : t('modal.delete.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
