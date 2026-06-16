import { useState, useEffect, useCallback, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserProvider } from '@chat/sdk';
import type { EffortSpec, ModelOption } from '../types/chat';
import { filterAllowedFiles } from '../lib/file-types';

export interface ChatInputBarProps {
  inputText: string;
  setInputText: (v: string) => void;
  streaming: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  stopStream: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  selectedLabel: string;
  selectedProvider: string | null;
  selectedModel: string | null;
  setSelectedModel: (v: string | null) => void;
  models: ModelOption[];
  modelsLoading: boolean;
  multiMode: boolean;
  setMultiMode: React.Dispatch<React.SetStateAction<boolean>>;
  incognito: boolean;
  setIncognito: (value: boolean) => void;
  /** Connected providers for the current user (drives the send-button gate). */
  userProviders: UserProvider[];
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  modelDropdownRef: React.RefObject<HTMLDivElement>;
  modelSearch: string;
  setModelSearch: (v: string) => void;
  effortSpec: EffortSpec | null;
  effortLoading: boolean;
  selectedEffort: string;
  setSelectedEffort: (v: string) => void;
  isEffortDropdownOpen: boolean;
  setIsEffortDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  effortDropdownRef: React.RefObject<HTMLDivElement>;
  effortSearch: string;
  setEffortSearch: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  hasMessages?: boolean;
  councilModelCount?: number;
  /**
   * Called with the rejected files when a drop or file picker selection
   * contains types other than images or PDFs. Lets the parent surface a
   * user-visible error (toast / inline banner) without coupling the composer
   * to any specific notification system.
   */
  onRejectedFiles?: (rejected: File[]) => void;
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function NetworkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <circle cx="5" cy="6" r="3" />
      <circle cx="19" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <path d="M5 9v2a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9" />
      <path d="M12 15V9" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

/* File-type icons (SVG, stroke-based — no emojis per the design system). */
function FileTypeIcon({ file, className = 'w-5 h-5' }: { file: File; className?: string }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const t = file.type;
  if (t.startsWith('image/')) {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    );
  }
  if (t.includes('pdf')) {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9zM9 13v5" />
      </svg>
    );
  }
  if (t.includes('spreadsheet') || t.includes('excel') || t.includes('csv')) {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13l3 5M11 13l-3 5" />
      </svg>
    );
  }
  if (t.includes('word') || t.includes('document') || t.startsWith('text/')) {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h8M8 9h2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
    </svg>
  );
}

export function ChatInputBar(props: ChatInputBarProps) {
  const { t } = useTranslation();
  const {
    inputText,
    setInputText,
    streaming,
    handleSubmit,
    stopStream,
    fileInputRef,
    files,
    setFiles,
    selectedLabel,
    selectedProvider,
    selectedModel,
    setSelectedModel,
    models,
    modelsLoading,
    multiMode,
    setMultiMode,
    incognito,
    setIncognito,
    userProviders,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    modelDropdownRef,
    modelSearch,
    setModelSearch,
    effortSpec,
    effortLoading,
    selectedEffort,
    isEffortDropdownOpen,
    setIsEffortDropdownOpen,
    effortDropdownRef,
    effortSearch,
    setEffortSearch,
    textareaRef,
    hasMessages,
    councilModelCount = 0,
    onRejectedFiles,
  } = props;

  const councilCountLabel = t('chat.input.councilCount', { count: councilModelCount });

  // Mode is freely switchable: Único ⇄ Consejo only changes how the NEXT message
  // is processed; a conversation can mix single and council turns without issue.
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [sendPulsing, setSendPulsing] = useState(false);
  // True while a file is being dragged over the composer. Used to render a
  // visual cue (dashed border + tinted background) and to gate the drop handler.
  const [isDragging, setIsDragging] = useState(false);

  /**
   * Filters the given files through the type allowlist and routes them to
   * the appropriate callbacks. Centralized so the file picker path and the
   * drop path share exactly the same behavior.
   */
  const ingestFiles = useCallback(
    (incoming: File[]) => {
      const { allowed, rejected } = filterAllowedFiles(incoming);
      if (allowed.length > 0) {
        setFiles((prev) => [...prev, ...allowed]);
      }
      if (rejected.length > 0) {
        onRejectedFiles?.(rejected);
      }
    },
    [setFiles, onRejectedFiles]
  );

  useEffect(() => {
    const previews: Record<string, string> = {};
    files.forEach((f) => {
      if (f.type.startsWith('image/')) previews[f.name] = URL.createObjectURL(f);
    });
    setImagePreviews(previews);
    return () => {
      Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const placeholderText = incognito
    ? t('chat.input.placeholder.incognito')
    : multiMode
      ? t('chat.input.placeholder.council')
      : hasMessages
        ? t('chat.input.placeholder.reply')
        : t('chat.input.placeholder.default');

  // Onboarding UX gate (2026-06-14): disable the send button when the user
  // can't actually send. Without this, the input bar is enabled with 0
  // providers → click send → backend 400 "No API key configured..." →
  // user sees a cryptic error. Three failure modes to gate:
  //   1. Zero providers connected (single + Consejo)
  //   2. <2 providers in Consejo (needs ≥2 to deliberate)
  //   3. Zero models visible (ActiveModelsConfig filtered everything,
  //      or registry has no text models for the connected providers,
  //      or the initial useModels fetch hasn't resolved yet — we treat
  //      "loading with no cache" the same as "no models" because we
  //      don't know if the user can actually send).
  const noProviders = userProviders.length === 0;
  const notEnoughForCouncil = multiMode && userProviders.length < 2;
  const noModelsLoaded = models.length === 0;
  const canSend =
    (inputText.trim().length > 0 || files.length > 0) &&
    !noProviders &&
    !notEnoughForCouncil &&
    !noModelsLoaded;
  // Human-readable reason for the disabled state. Surfaced as the
  // `title` attr on the send button so the user gets context on hover.
  const sendBlockedReason = noProviders
    ? t('chat.input.sendBlocked.noProviders')
    : notEnoughForCouncil
      ? t('chat.input.sendBlocked.councilNeeds2')
      : modelsLoading
        ? t('chat.input.sendBlocked.loading')
        : noModelsLoaded
          ? t('chat.input.sendBlocked.noModels')
          : null;

  // Drag-and-drop handlers — gate everything on `!streaming` so a user
  // can't drop files mid-generation (the disabled send button reflects the
  // same constraint for the file picker path).
  const handleDragEnter = (e: DragEvent<HTMLFormElement>) => {
    if (streaming) return;
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };
  const handleDragOver = (e: DragEvent<HTMLFormElement>) => {
    if (streaming) return;
    // preventDefault is REQUIRED for `drop` to fire on most browsers.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: DragEvent<HTMLFormElement>) => {
    if (streaming) return;
    // Only clear when the cursor leaves the form entirely (relatedTarget is
    // outside the form). This prevents flicker when dragging over child nodes.
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragging(false);
    }
  };
  const handleDrop = (e: DragEvent<HTMLFormElement>) => {
    if (streaming) return;
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) ingestFiles(dropped);
  };

  return (
    <form
      onSubmit={handleSubmit}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-dragging={isDragging ? 'true' : 'false'}
      className="relative"
    >
      <div
        className="transition-colors"
        style={{
          backgroundColor: 'var(--bg-input)',
          border: isDragging ? '1px dashed var(--accent)' : '1px solid var(--border-strong)',
          borderRadius: 'var(--r-lg)',
          boxShadow: isDragging ? '0 0 0 3px var(--accent-quiet)' : 'var(--shadow-md)',
          padding: '16px 16px 12px',
          transition: 'border-color 120ms, box-shadow 120ms',
        }}
      >
        {incognito && (
          <div
            role="status"
            className="mb-2 flex items-center gap-2 px-2 text-xs"
            style={{ color: 'var(--m-amber)' }}
          >
            <span aria-hidden="true">◌</span>
            <span>{t('chat.input.incognitoNotice')}</span>
          </div>
        )}
        {/* Drag-and-drop visual cue (subtle label inside the composer). */}
        {isDragging && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            style={{ borderRadius: 'var(--r-lg)' }}
          >
            <div
              className="text-sm font-medium"
              style={{
                color: 'var(--accent-text)',
                backgroundColor: 'var(--bg-elevated)',
                padding: '6px 12px',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {t('chat.input.dropHint')}
            </div>
          </div>
        )}
        {/* File previews (inside composer) */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pb-3">
            {files.map((f, i) => (
              <div
                key={i}
                className="relative group overflow-hidden"
                style={{
                  width: imagePreviews[f.name] ? 112 : 200,
                  minHeight: 72,
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                {imagePreviews[f.name] ? (
                  <div className="relative h-full">
                    <img
                      src={imagePreviews[f.name]}
                      alt={f.name}
                      className="w-full h-[112px] object-cover"
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 p-2"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(20,21,24,0) 0%, rgba(20,21,24,0.86) 72%)',
                      }}
                    >
                      <p className="text-[11px] truncate" style={{ color: '#fff' }}>
                        {f.name}
                      </p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.72)' }}>
                        {(f.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 h-full">
                    <span style={{ color: 'var(--text-3)' }}>
                      <FileTypeIcon file={f} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                        {f.name}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                        {(f.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                  style={{
                    backgroundColor: 'rgba(17, 18, 22, 0.84)',
                    color: '#fff',
                    backdropFilter: 'blur(6px)',
                  }}
                  aria-label={t('chat.input.removeFile')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Top row: textarea */}
        <div className="flex items-end px-1 pt-1 gap-3">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={placeholderText}
            disabled={streaming}
            rows={1}
            className="flex-1 bg-transparent placeholder-gray-500 resize-none outline-none py-2 min-h-[24px] max-h-[200px] transition-opacity duration-100"
            style={{
              color: 'var(--text-1)',
              fontSize: 15,
              lineHeight: 1.62,
            }}
          />
        </div>

        {/* Bottom toolbar: attach, segmented, spacer, model, send */}
        <div className="flex items-center pt-3 gap-2">
          {/* Attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            title={t('chat.input.attachFile')}
            aria-label={t('chat.input.attachFile')}
            className="p-2 rounded-full transition-colors shrink-0 disabled:opacity-40 active:scale-95 transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>

          {/* Segmented control: Único | Consejo */}
          <div
            className="flex items-center shrink-0"
            role="group"
            aria-label={t('chat.input.modeGroup')}
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--r-pill)',
              padding: 3,
              gap: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setMultiMode(false)}
              disabled={streaming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all disabled:cursor-not-allowed active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                backgroundColor: !multiMode ? 'var(--accent-quiet)' : 'transparent',
                color: !multiMode ? 'var(--accent-text)' : 'var(--text-3)',
                boxShadow: !multiMode ? 'inset 0 0 0 1px var(--accent-line)' : 'none',
                opacity: streaming ? 0.4 : 1,
              }}
            >
              <PersonIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('chat.input.singleMode')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMultiMode(true)}
              disabled={streaming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all disabled:opacity-40 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                backgroundColor: multiMode ? 'var(--accent-quiet)' : 'transparent',
                color: multiMode ? 'var(--accent-text)' : 'var(--text-3)',
                boxShadow: multiMode ? 'inset 0 0 0 1px var(--accent-line)' : 'none',
              }}
            >
              <NetworkIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('chat.input.councilMode')}</span>
            </button>
          </div>

          <button
            type="button"
            role="switch"
            aria-label={t('chat.input.incognitoMode')}
            aria-checked={incognito}
            onClick={() => setIncognito(!incognito)}
            disabled={streaming}
            title={
              incognito ? t('chat.input.incognitoDeactivate') : t('chat.input.incognitoActivate')
            }
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
            style={{
              backgroundColor: incognito ? 'rgba(245, 158, 11, 0.12)' : 'var(--hover)',
              color: incognito ? 'var(--m-amber)' : 'var(--text-3)',
              border: incognito ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid transparent',
            }}
          >
            <svg
              aria-hidden="true"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
            >
              <path d="M3 11.5C5.4 7.8 8.4 6 12 6s6.6 1.8 9 5.5c-2.4 3.7-5.4 5.5-9 5.5s-6.6-1.8-9-5.5Z" />
              <path d="m4 4 16 16" />
            </svg>
            <span className="hidden sm:inline">{t('chat.input.incognitoMode')}</span>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Model selector */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              type="button"
              onClick={() => {
                if (multiMode) return;
                setIsEffortDropdownOpen(false);
                setIsModelDropdownOpen((v) => !v);
              }}
              disabled={modelsLoading || models.length === 0 || multiMode}
              title={
                multiMode
                  ? t('chat.input.modelSelectorTitle.council')
                  : t('chat.input.modelSelectorTitle.single')
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors max-w-[180px] sm:max-w-[260px] active:scale-95 transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)] disabled:opacity-40"
              style={{
                backgroundColor: multiMode ? 'transparent' : 'var(--hover)',
                color: multiMode ? 'var(--text-4)' : 'var(--text-2)',
                cursor: multiMode ? 'not-allowed' : 'pointer',
              }}
            >
              {!multiMode && (
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              )}
              <span className="truncate">{multiMode ? councilCountLabel : selectedLabel}</span>
              {!multiMode && selectedProvider && (
                <span
                  className="hidden sm:inline shrink-0 font-mono-ui"
                  style={{ color: 'var(--text-4)' }}
                >
                  {selectedProvider}
                </span>
              )}
              {!multiMode && (
                <ChevronDownIcon
                  className={`w-3 h-3 shrink-0 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`}
                />
              )}
            </button>

            {isModelDropdownOpen && !multiMode && (
              <div
                className="absolute bottom-full right-0 mb-2 w-80 overflow-hidden z-50"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <div className="p-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder={t('chat.input.modelSearchPlaceholder')}
                    className="w-full rounded-lg px-3 py-1.5 outline-none text-sm transition-colors focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-1)',
                      border: '1px solid var(--border)',
                    }}
                  />
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {modelsLoading && (
                    <div className="p-4 text-sm text-center" style={{ color: 'var(--text-3)' }}>
                      {t('chat.input.modelLoading')}
                    </div>
                  )}
                  {!modelsLoading && models.length === 0 && (
                    <div className="p-4 text-sm text-center" style={{ color: 'var(--text-2)' }}>
                      <Link
                        to="/settings"
                        className="underline hover:opacity-80"
                        style={{ color: 'var(--accent-text)' }}
                        onClick={() => setIsModelDropdownOpen(false)}
                      >
                        {t('chat.input.modelEmpty')}
                      </Link>
                    </div>
                  )}
                  {models.map((m) => {
                    const key = `${m.provider}:${m.id}`;
                    const isSel = selectedModel === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSelectedModel(isSel ? null : key);
                          setIsModelDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                        style={{
                          backgroundColor: isSel ? 'var(--accent-quiet)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSel)
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                              'var(--hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSel)
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                              'transparent';
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-sm font-medium truncate"
                              style={{ color: 'var(--text-1)' }}
                            >
                              {m.name}
                            </span>
                            <span
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-2)',
                              }}
                            >
                              {m.provider}
                            </span>
                          </div>
                          <div
                            className="text-xs mt-0.5 truncate"
                            style={{ color: 'var(--text-4)' }}
                          >
                            {m.description}
                          </div>
                          {m.capabilities && (
                            <div className="flex gap-1 mt-1">
                              {m.capabilities
                                .filter(Boolean)
                                .slice(0, 4)
                                .map((c) => (
                                  <span
                                    key={c}
                                    className="text-[9px] px-1 py-0.5 rounded"
                                    style={{
                                      backgroundColor: 'var(--bg-app)',
                                      color: 'var(--text-3)',
                                    }}
                                  >
                                    {c}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                        {isSel && (
                          <svg
                            className="w-4 h-4 shrink-0"
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

          {/* Effort dropdown (hidden from main bar, but kept for advanced use if needed) */}
          {(effortSpec || effortLoading) && !multiMode && (
            <div className="relative hidden" ref={effortDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (!effortSpec) return;
                  setIsModelDropdownOpen(false);
                  setIsEffortDropdownOpen((v) => !v);
                }}
                disabled={streaming || effortLoading || !effortSpec}
                title={t('chat.input.effortTitle')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors shrink-0 disabled:opacity-40 active:scale-95 transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                style={{
                  backgroundColor:
                    selectedEffort === 'default' ? 'var(--hover)' : 'var(--accent-quiet)',
                  color: selectedEffort === 'default' ? 'var(--text-2)' : 'var(--accent-text)',
                }}
              >
                <span className="hidden sm:inline" style={{ color: 'var(--text-4)' }}>
                  {t('chat.input.effortVariant')}
                </span>
                <span className="font-semibold">{effortLoading ? '…' : selectedEffort}</span>
                {effortSpec && (
                  <ChevronDownIcon
                    className={`w-3 h-3 transition-transform ${isEffortDropdownOpen ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {isEffortDropdownOpen && effortSpec && (
                <div
                  className="absolute bottom-full right-0 mb-2 w-64 overflow-hidden z-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div
                      className="text-[11px] uppercase tracking-wide"
                      style={{ color: 'var(--text-4)' }}
                    >
                      {t('chat.input.effortSelectHeader')}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {t('chat.input.effortSelectSub')}
                    </div>
                  </div>
                  <div className="p-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <input
                      type="text"
                      value={effortSearch}
                      onChange={(e) => setEffortSearch(e.target.value)}
                      placeholder={t('chat.input.effortSearchPlaceholder')}
                      className="w-full rounded-lg px-3 py-1.5 outline-none text-sm transition-colors focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-1)',
                        border: '1px solid var(--border)',
                      }}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {/* effort options would go here — kept minimal since hidden */}
                    <div className="p-4 text-sm text-center" style={{ color: 'var(--text-3)' }}>
                      {t('chat.input.effortEmpty', { variant: selectedEffort })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Send / stop */}
          {streaming ? (
            <button
              type="button"
              onClick={stopStream}
              title={t('chat.input.stopTitle')}
              aria-label={t('chat.input.stopTitle')}
              className="rounded-full flex items-center justify-center transition-colors shrink-0 active:scale-95 transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                width: 38,
                height: 38,
                backgroundColor: 'var(--m-rose)',
                color: '#fff',
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title={sendBlockedReason ?? t('chat.input.sendTitle')}
              aria-label={t('chat.input.sendTitle')}
              onClick={() => {
                setSendPulsing(true);
                setTimeout(() => setSendPulsing(false), 150);
              }}
              className="rounded-full flex items-center justify-center transition-colors shrink-0 active:scale-95 transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)] disabled:cursor-not-allowed"
              style={{
                width: 38,
                height: 38,
                backgroundColor: canSend ? 'var(--accent)' : 'var(--bg-elevated)',
                color: canSend ? '#fff' : 'var(--text-3)',
                boxShadow: canSend ? '0 2px 8px rgba(111,123,242,0.25)' : 'none',
                opacity: canSend ? 1 : 0.6,
              }}
            >
              <ArrowRightIcon className={`w-4 h-4 ${sendPulsing ? 'animate-send-pulse' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input — the attach button triggers it via `fileInputRef.current?.click()`.
          Lives here (not in ChatPage) so both the picker path and the drag-drop path
          share the same `ingestFiles` filter. The `accept` attribute is advisory — the
          user can still pick "All files" in the OS picker, so `ingestFiles` re-filters. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="fixed -top-96 left-0 w-0 h-0 opacity-0 pointer-events-none"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length > 0) ingestFiles(picked);
          // Reset the input so picking the same file twice still triggers `change`.
          e.target.value = '';
        }}
      />
    </form>
  );
}
