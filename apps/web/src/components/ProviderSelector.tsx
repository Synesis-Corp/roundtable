import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModels } from '../hooks/useModels';

interface Props {
  selected: string | null;
  onSelect: (value: string | null) => void;
}

export default function ProviderSelector({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  const { models, loading } = useModels();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [models, search]);

  const selectedModel = selected ? models.find((m) => `${m.provider}:${m.id}` === selected) : null;

  const selectedLabel = selectedModel?.name || 'Select model';

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setIsOpen((v) => !v);
          setSearch('');
        }}
        disabled={loading || models.length === 0}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gray-700/50 hover:bg-gray-700 text-xs text-gray-300 transition-colors disabled:opacity-40"
      >
        <span className="truncate max-w-[100px]">{selectedLabel}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-[#2f2f2f] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-700/50">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-[#1a1a1a] border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {loading && <div className="p-4 text-sm text-gray-500 text-center">Loading...</div>}

            {!loading && filteredModels.length === 0 && (
              <div className="p-4 text-sm text-gray-400 text-center">
                {models.length === 0
                  ? t('settings.noProvidersConnected')
                  : t('settings.noModelsMatchSearch')}
              </div>
            )}

            {filteredModels.map((model) => {
              const key = `${model.provider}:${model.id}`;
              const isSelected = selected === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    onSelect(isSelected ? null : key);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                    isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200 truncate">
                        {model.name}
                      </span>
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-300">
                        {model.provider}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{model.description}</div>
                    {model.capabilities && model.capabilities.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {model.capabilities.slice(0, 3).map((cap) => (
                          <span
                            key={cap}
                            className="text-[9px] px-1 py-px rounded bg-gray-800 text-gray-400 font-mono"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-blue-400 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
