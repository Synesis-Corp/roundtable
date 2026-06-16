import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMemory, type MemoryItem } from '../hooks/useMemory';

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function MemorySettingsSection() {
  const { t } = useTranslation();
  const {
    memories,
    loading,
    error,
    saving,
    deletingId,
    memoryEnabled,
    setMemoryEnabled,
    createMemory,
    updateMemory,
    deleteMemory,
    refetch,
  } = useMemory();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setContent('');
    setTags('');
    setShowForm(true);
  };

  const openEdit = (memory: MemoryItem) => {
    setEditingId(memory.id);
    setContent(memory.content);
    setTags(memory.tags.join(', '));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setContent('');
    setTags('');
  };

  const saveMemory = async () => {
    const cleanContent = content.trim();
    if (!cleanContent) return;

    try {
      if (editingId) {
        await updateMemory(editingId, cleanContent, parseTags(tags));
      } else {
        await createMemory(cleanContent, parseTags(tags));
      }
      closeForm();
    } catch {
      // The hook publishes the actionable error and the form remains open.
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="memory-settings-title">
      <div
        className="flex items-start justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 20,
        }}
      >
        <div className="min-w-0">
          <h2
            id="memory-settings-title"
            style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}
          >
            {t('settings.memory.title')}
          </h2>
          <p className="mt-1" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            {t('settings.memory.subtitle')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label={t('settings.memory.title')}
          aria-checked={memoryEnabled}
          onClick={() => setMemoryEnabled(!memoryEnabled)}
          className="relative shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
          style={{
            width: 44,
            height: 24,
            backgroundColor: memoryEnabled ? 'var(--accent)' : 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-transform"
            style={{ left: 2, transform: memoryEnabled ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
            {t('settings.memory.listTitle')}
          </h3>
          <p className="mt-0.5" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {t('settings.memory.listSub')}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {t('settings.memory.add')}
        </button>
      </div>

      {showForm && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--accent-line)',
            borderRadius: 'var(--r-md)',
            padding: 16,
          }}
        >
          <label
            htmlFor="memory-content"
            className="block text-sm font-medium"
            style={{ color: 'var(--text-1)' }}
          >
            {t('settings.memory.content')}
          </label>
          <textarea
            id="memory-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            maxLength={2_000}
            className="mt-2 w-full resize-y rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
            }}
          />

          <label
            htmlFor="memory-tags"
            className="mt-3 block text-sm font-medium"
            style={{ color: 'var(--text-1)' }}
          >
            {t('settings.memory.tags')}
          </label>
          <input
            id="memory-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={t('settings.memory.tagsPlaceholder')}
            className="mt-2 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
            }}
          />

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={saving || !content.trim()}
              onClick={() => void saveMemory()}
              className="rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {saving
                ? t('settings.memory.saving')
                : editingId
                  ? t('settings.memory.saveChanges')
                  : t('settings.memory.save')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={closeForm}
              className="rounded-lg px-3.5 py-2 text-sm"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              {t('settings.memory.cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3"
          style={{
            borderRadius: 'var(--r-md)',
            border: '1px solid rgba(208,119,160,0.25)',
            backgroundColor: 'rgba(208,119,160,0.07)',
            color: 'var(--m-rose)',
            padding: '10px 14px',
            fontSize: 13,
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={refetch} className="font-medium underline">
            {t('settings.memory.retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div role="status" aria-live="polite" style={{ color: 'var(--text-3)', fontSize: 13 }}>
          {t('settings.memory.loading')}
        </div>
      ) : memories.length === 0 ? (
        <div
          className="py-10 text-center"
          style={{
            borderRadius: 'var(--r-md)',
            border: '1px dashed var(--border)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <p style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 500 }}>
            {t('settings.memory.empty')}
          </p>
          <p className="mt-1" style={{ color: 'var(--text-3)', fontSize: 13 }}>
            {t('settings.memory.emptySub')}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {memories.map((memory) => (
            <li
              key={memory.id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: 16,
              }}
            >
              <p style={{ color: 'var(--text-1)', fontSize: 14, lineHeight: 1.55 }}>
                {memory.content}
              </p>
              {memory.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {memory.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-3)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  aria-label={t('settings.memory.editAria')}
                  onClick={() => openEdit(memory)}
                  className="text-xs font-medium"
                  style={{ color: 'var(--accent-text)' }}
                >
                  {t('settings.memory.edit')}
                </button>
                <button
                  type="button"
                  aria-label={t('settings.memory.deleteAria')}
                  disabled={deletingId === memory.id}
                  onClick={() => void deleteMemory(memory.id).catch(() => undefined)}
                  className="text-xs font-medium disabled:opacity-50"
                  style={{ color: 'var(--m-rose)' }}
                >
                  {deletingId === memory.id
                    ? t('settings.memory.deleting')
                    : t('settings.memory.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
