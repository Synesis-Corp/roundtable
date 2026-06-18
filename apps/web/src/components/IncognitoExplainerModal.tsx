import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface IncognitoExplainerModalProps {
  open: boolean;
  onClose: () => void;
  /** Element that triggered the open — focus returns here on close. */
  triggerRef?: React.RefObject<HTMLElement>;
}

/**
 * Native <dialog> explainer for incognito mode. The modal is ADDITIVE
 * to the inline banner in the composer (the banner stays). First use of
 * <dialog> in the codebase; sets the convention.
 *
 * Behaviour:
 * - showModal() / close() lifecycle.
 * - body scroll lock while open, restored on close (captures pre-open value).
 * - focus moves to the close button on open, returns to trigger on close.
 * - Esc and backdrop click close; clicks inside content don't.
 * - Respects prefers-reduced-motion.
 */
export function IncognitoExplainerModal({
  open,
  onClose,
  triggerRef,
}: IncognitoExplainerModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const preOpenOverflowRef = useRef<string>('');

  // Body overflow management lives in its OWN effect so it can run even
  // when the component returns null (the dialog is unmounted). Without
  // this, the close path would lose the dialog ref and skip the restore.
  useLayoutEffect(() => {
    if (open) {
      preOpenOverflowRef.current = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = preOpenOverflowRef.current;
      triggerRef?.current?.focus();
    }
  }, [open, triggerRef]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        // showModal() places the dialog in the top layer and applies a backdrop.
        // jsdom's <dialog> is a no-op for showModal/close, so we set the
        // attribute directly to mirror the live behaviour for tests.
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
        // Focus the close button (defer a tick so the browser finishes the
        // open animation / layout pass).
        requestAnimationFrame(() => closeBtnRef.current?.focus());
      }
    } else {
      if (dialog.open) {
        try {
          dialog.close();
        } catch {
          dialog.removeAttribute('open');
        }
      }
    }
  }, [open]);

  // Global Esc handler — <dialog> intercepts Esc natively when opened
  // via showModal(), but jsdom doesn't, so we wire one defensively.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // REQ-MODAL-5: focus trap. Tab on the last focusable element wraps to
  // the first; Shift+Tab on the first wraps to the last. Anything in
  // between is the browser's job — we only preventDefault on the wrap
  // cases. The selector matches buttons, links, and form fields inside
  // the dialog (anything natively focusable, minus tabindex=-1).
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const FOCUSABLE_SELECTOR =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Backdrop click: native <dialog> dispatches a click whose target is
  // the dialog element when the user clicks the backdrop. When they
  // click inside the content, target is the inner element.
  const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!open) return null;

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true"
      onClick={onDialogClick}
      style={{
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'var(--text-1)',
        maxWidth: 'min(560px, 92vw)',
        width: '100%',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '24px 24px 20px',
          // 180ms in, 0s under reduced motion. Out animation is handled
          // by the browser via <dialog>::backdrop.
          transition: reduceMotion ? 'transform 0s, opacity 0s' : 'transform 180ms, opacity 180ms',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
            {t('chat.incognito.explainer.title')}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label={t('chat.incognito.explainer.dismiss')}
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)', margin: '0 0 10px' }}>
          {t('chat.incognito.explainer.p1')}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)', margin: '0 0 10px' }}>
          {t('chat.incognito.explainer.p2')}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)', margin: '0 0 10px' }}>
          {t('chat.incognito.explainer.p3')}
        </p>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--text-3)',
            margin: '0 0 16px',
            fontStyle: 'italic',
          }}
        >
          {/* 4th paragraph (recorded, not saved) — surfaces the spec's "what IS recorded" line. */}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t('chat.incognito.explainer.close')}
          </button>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
