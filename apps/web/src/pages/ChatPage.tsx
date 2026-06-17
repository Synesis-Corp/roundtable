import { storage } from '../lib/storage';
import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { OnboardingWizard } from '../components/OnboardingWizard';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { useSSE } from '../hooks/useSSE';
import { useChatStreamHandlers } from '../hooks/useChatStreamHandlers';
import { useChatActions } from '../hooks/useChatActions';
import { useModels } from '../hooks/useModels';
import { useSettings } from '../hooks/useSettings';
import { useOnboarding } from '../hooks/useOnboarding';
import { useCouncilConfig } from '../hooks/useCouncilConfig';
import { useStreaming } from '../lib/streaming-context';
import { getGreeting, getCouncilPreviewCount } from '../lib/chat-page-helpers';
import {
  useNewChatListener,
  useRouteNewChatTrigger,
  usePasteToAttach,
} from '../hooks/chat-page-hooks';
import { useProfile } from '../hooks/useProfile';
import { useConversationLoader } from '../hooks/useConversationLoader';
import { useEffortVariants } from '../hooks/useEffortVariants';
import { ChatInputBar } from '../components/ChatInputBar';
const ChatMessageItem = lazy(() =>
  import('../components/ChatMessageItem').then((m) => ({ default: m.ChatMessageItem }))
);
import { RoundtableBanner } from '../components/RoundtableBanner';
import { QuickActions, DeliberationSteps } from '../components/QuickActions';
import type { OnboardingNew, OnboardingReturning } from '../lib/onboarding-helpers';
import type { ChatMessage, MultiInfo, EffortSpec, CouncilInfo } from '../types/chat';

export default function ChatPage() {
  const { conversationId: routeConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(() =>
    storage.get('selectedModel')
  );
  const [multiMode, setMultiMode] = useState(false);
  const [incognito, setIncognito] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(routeConversationId ?? null);
  // The conversation's real title (loaded or model-generated). Falls back to the
  // first user message for the topbar when not yet known.
  const [conversationTitleState, setConversationTitleState] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const { profile, loading: profileLoading } = useProfile();
  const displayName = profile?.displayName || profile?.name || '';
  const userName = displayName;
  const [error, setError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [multiInfo, setMultiInfo] = useState<MultiInfo | null>(null);
  const [effortSpec, setEffortSpec] = useState<EffortSpec | null>(null);
  const [selectedEffort, setSelectedEffort] = useState('default');
  const [effortLoading, setEffortLoading] = useState(false);
  const [isEffortDropdownOpen, setIsEffortDropdownOpen] = useState(false);
  const [effortSearch, setEffortSearch] = useState('');
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageIdSetRef = useRef<Set<string>>(new Set());
  const justLoadedRef = useRef(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const effortDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { models, loading: modelsLoading } = useModels();
  const { userProviders, userProvidersLoading } = useSettings();
  const { onboarding } = useOnboarding({ userProviders, userProvidersLoading, modelsLoading });
  const { config: councilConfig } = useCouncilConfig();

  const [councilInfo, setCouncilInfo] = useState<CouncilInfo | null>(null);

  useEffect(() => {
    if (!councilInfo) return;

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;

      const updated = [...prev];
      updated[updated.length - 1] = {
        ...last,
        provider: 'council',
        councilInfo,
      };
      return updated;
    });
  }, [councilInfo]);

  const { setStreaming } = useStreaming();

  const sseOptions = useChatStreamHandlers({
    setMessages,
    setConversationId,
    setConversationTitleState,
    setMultiInfo,
    setCouncilInfo,
    navigate,
    routeConversationId,
  });
  const { streaming, startStream, resumeStream, stopStream } = useSSE(sseOptions);

  const resetToNewChat = useCallback(() => {
    stopStream();
    setConversationId(null);
    setConversationTitleState(null);
    setMessages([]);
    setMultiInfo(null);
    setCouncilInfo(null);
    setError(null);
    setLoadingConversation(false);
    setInputText('');
    setFiles([]);
  }, [stopStream]);

  const handleIncognitoChange = useCallback(
    (nextIncognito: boolean) => {
      if (nextIncognito === incognito) return;
      resetToNewChat();
      setIncognito(nextIncognito);
      navigate('/', { replace: true });
    },
    [incognito, navigate, resetToNewChat]
  );

  useNewChatListener(resetToNewChat);
  useRouteNewChatTrigger(location.state as { newChatAt?: number } | null, resetToNewChat);
  usePasteToAttach(setFiles);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }, [inputText]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isModelDropdownOpen]);

  // Close effort dropdown on outside click
  useEffect(() => {
    if (!isEffortDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (effortDropdownRef.current && !effortDropdownRef.current.contains(e.target as Node)) {
        setIsEffortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isEffortDropdownOpen]);

  // Auto-scroll on messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Publish streaming state to the sidebar so it can guard navigation.
  useEffect(() => {
    setStreaming(streaming);
    return () => setStreaming(false);
  }, [streaming, setStreaming]);

  // Track newly-added message IDs for entrance animation.
  // Skip animation when loading a historic conversation (justLoadedRef).
  useEffect(() => {
    if (loadingConversation) {
      justLoadedRef.current = true;
      return;
    }
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      messageIdSetRef.current = new Set(messages.map((m) => m.id));
      setNewMessageIds(new Set());
      return;
    }
    const currentIds = new Set(messages.map((m) => m.id));
    const added = new Set<string>();
    for (const id of currentIds) {
      if (!messageIdSetRef.current.has(id)) {
        added.add(id);
      }
    }
    messageIdSetRef.current = currentIds;
    if (added.size > 0) {
      setNewMessageIds(added);
      const timer = setTimeout(() => setNewMessageIds(new Set()), 300);
      return () => clearTimeout(timer);
    }
  }, [messages, loadingConversation]);

  // Load conversation when route id changes; reset on /
  useConversationLoader({
    routeConversationId,
    setConversationId,
    setConversationTitleState,
    setMessages,
    setMultiInfo,
    setCouncilInfo,
    setError,
    setLoadingConversation,
    resumeStream,
    stopStream,
  });

  // Load effort variants for the selected model. In Auto or Council mode the
  // target provider is not fixed, so no request-level effort can be applied.
  useEffortVariants({
    selectedModel,
    multiMode,
    setIsEffortDropdownOpen,
    setEffortSearch,
    setEffortSpec,
    setSelectedEffort,
    setEffortLoading,
  });

  const { handleSend, handleRegenerate, handleStopStream } = useChatActions({
    messages,
    setMessages,
    setError,
    setMultiInfo,
    setCouncilInfo,
    setFiles,
    setInputText,
    selectedModel,
    multiMode,
    incognito,
    // Onboarding UX gate (2026-06-14): defensive send gate in handleSend.
    userProviders,
    effortSpec,
    selectedEffort,
    conversationId,
    files,
    startStream,
    stopStream,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(inputText);
  };

  const setSelectedModelPersist = (model: string | null) => {
    setSelectedModel(model);
    if (model) storage.set('selectedModel', model);
    else storage.remove('selectedModel');
  };

  // Onboarding wizard (Fase 2.3) — called when the user finishes the
  // 4-step wizard. Sets the selected model so the chat is ready to send.
  const handleWizardCompleted = (providerId: string, modelId: string) => {
    const key = `${providerId}:${modelId}`;
    setSelectedModel(key);
    storage.set('selectedModel', key);
  };

  const setSelectedEffortPersist = (effort: string) => {
    setSelectedEffort(effort);
    if (!selectedModel) return;
    const key = `variant:${selectedModel}`;
    if (effort === 'default') storage.remove(key);
    else storage.set(key, effort);
  };

  const selectedModelData = selectedModel
    ? models.find((m) => `${m.provider}:${m.id}` === selectedModel)
    : null;
  const selectedLabel = selectedModelData?.name || t('chat.auto');
  const selectedProvider = selectedModelData?.provider ?? null;

  // Regression fixed 2026-06-14: if a `selectedModel` is in localStorage from
  // a previous session (different user on the same browser, or the user
  // removed/changed the provider since), it points at a model the current
  // user can't use. Chat send would fail with a misleading 400
  // "No API key configured for any candidate provider (openai)". Clear it
  // once the models list resolves and we can prove it's invalid.
  useEffect(() => {
    if (!selectedModel || modelsLoading || models.length === 0) return;
    const stillValid = models.some((m) => `${m.provider}:${m.id}` === selectedModel);
    if (!stillValid) {
      setSelectedModel(null);
      storage.remove('selectedModel');
    }
  }, [selectedModel, modelsLoading, models]);

  const filteredModels = models.filter((m) => {
    if (!modelSearch) return true;
    const q = modelSearch.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
    );
  });

  const hasMessages = messages.length > 0;
  const showWelcome = !hasMessages && !loadingConversation;

  // Conversation title for topbar — prefer the real (loaded or model-generated)
  // title; fall back to the first user turn while it isn't known yet.
  const firstUserMessage = messages.find((m) => m.role === 'user');
  const derivedTitle = firstUserMessage?.content?.replace(/\s+/g, ' ').trim();
  const conversationTitle = conversationTitleState
    ? conversationTitleState.length > 64
      ? `${conversationTitleState.slice(0, 64)}…`
      : conversationTitleState
    : derivedTitle
      ? derivedTitle.length > 64
        ? `${derivedTitle.slice(0, 64)}…`
        : derivedTitle
      : t('shell.newChat');

  // Empty provider state for council mode
  const showEmptyProvidersWarning = multiMode && userProviders.length < 2 && showWelcome;

  // Onboarding CTA — single mode only; never shown in council mode.
  const showOnboardingCta =
    !multiMode && showWelcome && (onboarding.kind === 'new' || onboarding.kind === 'returning');

  // Council model count: use manual config if available, otherwise auto-compute
  const configuredCouncilCount =
    councilConfig?.mode === 'manual' && councilConfig.modelIds.length >= 2
      ? councilConfig.modelIds.length
      : null;
  const availableCouncilModelCount =
    configuredCouncilCount ?? getCouncilPreviewCount(models, userProviders.length);

  // Shared props for both ChatInputBar instances (messages view + welcome). The
  // two differ only in `stopStream`, overridden at each call site.
  const inputBarProps = {
    inputText,
    setInputText,
    streaming,
    handleSubmit,
    fileInputRef,
    files,
    setFiles,
    selectedLabel,
    selectedProvider,
    selectedModel,
    setSelectedModel: setSelectedModelPersist,
    models: filteredModels,
    modelsLoading,
    multiMode,
    setMultiMode,
    // Onboarding UX gate (2026-06-14): ChatInputBar disables the send
    // button when userProviders is empty (or <2 in Consejo mode).
    userProviders,
    incognito,
    setIncognito: handleIncognitoChange,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    modelDropdownRef,
    modelSearch,
    setModelSearch,
    effortSpec,
    effortLoading,
    selectedEffort,
    setSelectedEffort: setSelectedEffortPersist,
    isEffortDropdownOpen,
    setIsEffortDropdownOpen,
    effortDropdownRef,
    effortSearch,
    setEffortSearch,
    textareaRef,
    hasMessages,
    councilModelCount: availableCouncilModelCount,
    // Surface rejected files (anything that isn't an image or a PDF) as a
    // top-of-chat error banner. Single source of truth for the type allowlist
    // lives in `apps/web/src/lib/file-types.ts`; this callback just renders.
    onRejectedFiles: (rejected: File[]) => {
      const names = rejected.map((f) => f.name).join(', ');
      setError(
        rejected.length === 1
          ? t('chat.rejectedOne', { names })
          : t('chat.rejectedMany', { count: rejected.length, names })
      );
    },
  };

  /**
   * Presentational sub-component for the onboarding CTA.
   * Reuses the same visual pattern as `showEmptyProvidersWarning` (rounded
   * container, amber accent, Link to /settings). Two variants:
   * - "replace": for new users — replaces the body paragraph (stronger emphasis).
   * - "banner": for returning users — soft banner that coexists with the greeting.
   */
  function OnboardingCta({
    state,
    variant: _variant,
    onOpenInlineConnect,
  }: {
    state: OnboardingNew | OnboardingReturning;
    variant: 'replace' | 'banner';
    onOpenInlineConnect: () => void;
  }) {
    return (
      <div
        data-testid="onboarding-cta"
        className="mb-8 mx-auto max-w-sm"
        style={{
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)',
          padding: '16px 18px',
        }}
      >
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-2)' }}>
          {t(state.bodyKey)}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onOpenInlineConnect}
            className="text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#fff',
            }}
          >
            {t('chat.connectHere')}
          </button>
          <Link
            to="/settings"
            className="text-sm underline underline-offset-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
            style={{ color: 'var(--accent-text)' }}
          >
            {t(state.ctaKey)}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-1)' }}
    >
      {/* Loading skeleton when fetching a historic conversation */}
      {loadingConversation ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full shrink-0 animate-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded w-2/3 animate-shimmer" />
                  <div className="h-3 rounded w-5/6 animate-shimmer" />
                  <div className="h-3 rounded w-1/2 animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : hasMessages ? (
        <>
          {/* Topbar */}
          <div
            className="shrink-0 flex items-center justify-between px-4 sm:px-6"
            style={{
              height: 52,
              backgroundColor: 'var(--bg-app)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                {conversationTitle}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {incognito ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    color: 'var(--m-amber)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                  }}
                >
                  {t('chat.incognitoChip')}
                </span>
              ) : multiMode ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'var(--accent-quiet)',
                    color: 'var(--accent-text)',
                    border: '1px solid var(--accent-line)',
                  }}
                >
                  {t('chat.councilChip', {
                    count: councilInfo?.members.length ?? availableCouncilModelCount,
                  })}
                </span>
              ) : selectedModelData ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span>{selectedModelData.name}</span>
                  <span className="font-mono-ui" style={{ color: 'var(--text-4)' }}>
                    {selectedModelData.provider}
                  </span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-3)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {t('chat.auto')}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="max-w-3xl mx-auto px-4 pt-4">
                <div
                  className="rounded-lg px-4 py-2 text-sm"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171',
                  }}
                >
                  {error}
                </div>
              </div>
            )}

            {/* Centered conversation column (ChatGPT-style readable width). */}
            <div className="max-w-3xl mx-auto px-4 py-3">
              {/* Roundtable orchestration banner */}
              {multiInfo && <RoundtableBanner multiInfo={multiInfo} />}

              <Suspense
                fallback={
                  <div
                    className="py-8 text-center"
                    style={{ color: 'var(--text-4)', fontSize: 13 }}
                  >
                    {t('shell.loading')}
                  </div>
                }
              >
                {messages.map((msg, i) => (
                  <ChatMessageItem
                    key={msg.id || i}
                    msg={msg}
                    userName={userName}
                    streaming={streaming}
                    isLast={i === messages.length - 1}
                    isNew={newMessageIds.has(msg.id)}
                    onRegenerate={
                      msg.role === 'assistant' && !msg.isError
                        ? () => handleRegenerate(i)
                        : undefined
                    }
                  />
                ))}
              </Suspense>
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div
            className="shrink-0"
            style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-app)' }}
          >
            <div className="max-w-3xl mx-auto px-4 py-4">
              <ChatInputBar {...inputBarProps} stopStream={handleStopStream} />
              <p className="text-center mt-2" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                {t('chat.disclaimer')}
              </p>
            </div>
          </div>
        </>
      ) : showWelcome ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 animate-fade-in-up">
          <div className="w-full max-w-[780px] -mt-8 sm:-mt-16">
            {/* Header */}
            <div className="text-center mb-10">
              {showOnboardingCta && onboarding.kind === 'new' ? (
                <h1
                  className="text-[32px] font-semibold tracking-tight"
                  style={{ color: 'var(--text-1)' }}
                >
                  {t(onboarding.titleKey)}
                </h1>
              ) : (
                <>
                  <p
                    className="font-serif text-[clamp(30px,4.5vw,44px)] leading-[1.1] tracking-tight mb-3"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {profileLoading
                      ? t(`chat.greeting.${getGreeting()}`)
                      : `${t(`chat.greeting.${getGreeting()}`)}${displayName ? `, ${displayName}` : ''}`}
                  </p>
                  <h1
                    className="text-[18px] font-medium tracking-tight"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {incognito
                      ? t('chat.welcome.titlePrivate')
                      : multiMode
                        ? t('chat.welcome.titleCouncil')
                        : t('chat.welcome.titleDefault')}
                  </h1>
                </>
              )}
              {showOnboardingCta && onboarding.kind === 'new' ? (
                <OnboardingCta
                  state={onboarding}
                  variant="replace"
                  onOpenInlineConnect={() => setWizardOpen(true)}
                />
              ) : multiMode ? (
                <p
                  className="mt-4 max-w-sm mx-auto leading-relaxed"
                  style={{ fontSize: 14, color: 'var(--text-3)' }}
                >
                  <Trans
                    i18nKey="chat.welcome.councilSubtitle"
                    count={availableCouncilModelCount}
                    components={{
                      accent: <span style={{ color: 'var(--accent)', fontWeight: 500 }} />,
                    }}
                  />
                </p>
              ) : null}
            </div>

            {/* Soft banner for returning users — coexists with the greeting */}
            {showOnboardingCta && onboarding.kind === 'returning' && (
              <OnboardingCta
                state={onboarding}
                variant="banner"
                onOpenInlineConnect={() => setWizardOpen(true)}
              />
            )}

            {/* Empty providers warning in council mode */}
            {showEmptyProvidersWarning && (
              <div
                className="mb-6 mx-auto max-w-md"
                style={{
                  borderRadius: 'var(--r-md)',
                  border: '1px solid rgba(207,154,94,0.2)',
                  backgroundColor: 'rgba(207,154,94,0.06)',
                  padding: '14px 18px',
                }}
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: 'var(--m-amber)' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--m-amber)' }}>
                      {t('chat.councilWarning')}
                    </p>
                    <Link
                      to="/settings"
                      className="text-sm underline underline-offset-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                      style={{ color: 'var(--accent)' }}
                    >
                      {t('chat.goToProviders')}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <ChatInputBar {...inputBarProps} stopStream={stopStream} />

            {/* Quick actions — single-model shortcuts; in Consejo mode we show
                the deliberation steps instead, since these are per-task prompts. */}
            {multiMode ? <DeliberationSteps /> : <QuickActions onSelect={setInputText} />}

            {/* Disclaimer */}
            <p className="text-center mt-8" style={{ fontSize: 11, color: 'var(--text-4)' }}>
              {t('chat.disclaimer')}
            </p>
          </div>
        </div>
      ) : null}

      {/* Onboarding wizard (Fase 2.3) — opened from the OnboardingCta
          "Conectar aquí" button. 4-step guided flow that ends with the
          user having a model selected and ready to chat. Replaces the
          inline modal of Fase 2.2 as the primary onboarding path. */}
      <OnboardingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCompleted={handleWizardCompleted}
      />
    </div>
  );
}
