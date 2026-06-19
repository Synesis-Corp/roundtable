import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { searchConversations, type ConversationSearchResult } from '../lib/api-client';
import { groupConversationsByDate } from '../lib/conversations';
import { SHORTCUT_SEARCH_EVENT } from './KeyboardShortcutsController';

const DEBOUNCE_MS = 200;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function renderSnippet(snippet: string): React.ReactNode[] {
  return snippet
    .split(/(<mark>|<\/mark>)/)
    .reduce<React.ReactNode[]>((nodes, part) => {
      if (part === '<mark>') {
        nodes.push('__MARK_OPEN__');
        return nodes;
      }
      if (part === '</mark>') {
        nodes.push('__MARK_CLOSE__');
        return nodes;
      }
      const lastOpen = nodes.lastIndexOf('__MARK_OPEN__');
      const lastClose = nodes.lastIndexOf('__MARK_CLOSE__');
      if (lastOpen > lastClose) {
        nodes.splice(lastOpen, 1);
        nodes.push(
          <mark key={`mark-${nodes.length}`} style={{ background: 'var(--accent-quiet)' }}>
            {part}
          </mark>
        );
      } else {
        nodes.push(part);
      }
      return nodes;
    }, [])
    .filter((node) => node !== '__MARK_CLOSE__') as React.ReactNode[];
}

export function SearchOverlay() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConversationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const preOpenOverflowRef = useRef('');

  useEffect(() => {
    const onShortcut = () => {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener(SHORTCUT_SEARCH_EVENT, onShortcut);
    return () => window.removeEventListener(SHORTCUT_SEARCH_EVENT, onShortcut);
  }, []);

  useLayoutEffect(() => {
    if (open) {
      preOpenOverflowRef.current = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = preOpenOverflowRef.current;
      triggerRef.current?.focus();
    }
  }, [open]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

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

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchConversations(trimmed, 20, controller.signal)
        .then((res) => {
          setResults(res.results);
          setSelected(0);
        })
        .catch((err) => {
          if ((err as Error).name !== 'AbortError') setResults([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const groups = useMemo(() => {
    return groupConversationsByDate(results).map((group) => ({
      ...group,
      conversations: group.conversations as ConversationSearchResult[],
    }));
  }, [results]);

  const close = () => setOpen(false);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((value) => Math.max(value - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      navigate(`/c/${results[selected].id}`);
      close();
    }
  };

  if (!open) return null;

  let flatIndex = 0;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-label={t('search.aria')}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        width: 'min(720px, 94vw)',
        maxWidth: '94vw',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'var(--text-1)',
      }}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('search.placeholder')}
            aria-label={t('search.aria')}
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg-input)',
              color: 'var(--text-1)',
              padding: '12px 14px',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ maxHeight: 'min(520px, 70vh)', overflowY: 'auto', padding: 12 }}>
          {!query.trim() ? (
            <p style={{ color: 'var(--text-3)', margin: 12 }}>{t('search.typeToSearch')}</p>
          ) : loading ? (
            <p style={{ color: 'var(--text-3)', margin: 12 }}>{t('search.loading')}</p>
          ) : results.length === 0 ? (
            <p style={{ color: 'var(--text-3)', margin: 12 }}>
              {t('search.noResults', { query: query.trim() })}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h3
                  style={{
                    margin: '14px 8px 6px',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-4)',
                  }}
                >
                  {group.label}
                </h3>
                {group.conversations.map((result) => {
                  const currentIndex = flatIndex++;
                  const active = currentIndex === selected;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onMouseEnter={() => setSelected(currentIndex)}
                      onClick={() => {
                        navigate(`/c/${result.id}`);
                        close();
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 'var(--r-sm)',
                        background: active ? 'var(--hover)' : 'transparent',
                        color: 'var(--text-1)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{result.title}</div>
                      {result.snippet ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>
                          {renderSnippet(result.snippet)}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </section>
    </dialog>,
    document.body
  );
}
