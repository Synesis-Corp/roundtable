import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useProviders } from '../hooks/useProviders';
import { useSettings } from '../hooks/useSettings';
import { useModels } from '../hooks/useModels';
import { CODEX_ENABLED } from '../lib/features';

type WizardStep = 1 | 2 | 3 | 4;
type ValidationResult = 'idle' | 'validating' | 'success' | 'error';

interface OnboardingWizardProps {
  /** Whether the wizard is visible. */
  open: boolean;
  /** Called when the user dismisses the wizard without completing it. */
  onClose: () => void;
  /**
   * Called when the user finishes the wizard (step 4 "Empezar a chatear").
   * The parent typically sets the selected model in state + localStorage
   * and dismisses the wizard.
   */
  onCompleted: (providerId: string, modelId: string) => void;
}

/**
 * "Onboarding Wizard" — modal multi-paso (4 steps) que guía al usuario nuevo
 * desde "veo el CTA" hasta "estoy chateando con un modelo" sin salir de `/`.
 *
 * Reemplaza al modal inline de Fase 2.2 (`OnboardingConnectModal`) como
 * la única vía de onboarding desde el welcome. El modal inline queda en
 * el código como quick-connect alternativo.
 *
 * Steps:
 *   1. Provider  — elegir uno de los 4-6 populares (cards, no chips)
 *   2. Auth      — API key paste, o rama OAuth para openai (Codex)
 *   3. Validate  — usa `useSettings.testConnection` (ya existe)
 *   4. Default   — auto-pick primer popular del provider, user puede cambiar
 *
 * El wizard NO persiste el progreso: cerrar = empezar de nuevo.
 */
export function OnboardingWizard({ open, onClose, onCompleted }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const { popularProviders, loading: providersLoading } = useProviders();
  const { handleConnect, handleCodexStart, testConnection, codexConnecting } = useSettings();
  const { models, loading: modelsLoading, refetch: refetchModels } = useModels();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState<{
    baseURL?: string;
    headers?: string;
    endpoint?: string;
  }>({});
  const [validationResult, setValidationResult] = useState<ValidationResult>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Tracks the step 3 → 4 in-flight connect so the Siguiente button
  // shows "Conectando…" and is disabled. (2026-06-14 fix.)
  const [connecting, setConnecting] = useState(false);

  // OAuth (Codex) is the openai path ONLY when enabled. On hosted instances
  // (VITE_CODEX_ENABLED=false) the localhost loopback callback can't work, so
  // openai falls back to the normal API-key flow like any other provider.
  const isOAuthProvider = CODEX_ENABLED && selectedProvider === 'openai';

  // Reset state on every open (close + reopen starts fresh).
  useEffect(() => {
    if (!open) return;
    setCurrentStep(1);
    setSelectedProvider(null);
    setApiKey('');
    setShowKey(false);
    setShowAdvanced(false);
    setAdvancedOptions({});
    setValidationResult('idle');
    setValidationError(null);
    setDefaultModelId(null);
    setSubmitting(false);
    setSubmitError(null);
  }, [open]);

  // Auto-pick the first popular on step 1 if none selected.
  useEffect(() => {
    if (open && currentStep === 1 && !selectedProvider && popularProviders[0]) {
      setSelectedProvider(popularProviders[0].id);
    }
  }, [open, currentStep, popularProviders, selectedProvider]);

  // When entering step 2 after picking an OAuth provider, no API key needed.
  // When entering step 3 with a fresh key, reset validation.
  useEffect(() => {
    if (currentStep === 3) {
      setValidationResult('idle');
      setValidationError(null);
    }
  }, [currentStep, apiKey]);

  // When entering step 4, auto-pick the first model of the connected
  // provider (from the most recent useModels fetch).
  useEffect(() => {
    if (currentStep !== 4 || !selectedProvider) return;
    const providerModels = models.filter((m) => m.provider === selectedProvider);
    if (providerModels.length > 0 && !defaultModelId) {
      setDefaultModelId(providerModels[0].id);
    }
  }, [currentStep, selectedProvider, models, defaultModelId]);

  if (!open) return null;

  const selectedProviderData = popularProviders.find((p) => p.id === selectedProvider) ?? null;

  // ── Step navigation helpers ──────────────────────────────────────────────

  const goNext = () => {
    if (currentStep < 4) setCurrentStep((s) => (s + 1) as WizardStep);
  };
  const goBack = () => {
    if (currentStep > 1) setCurrentStep((s) => (s - 1) as WizardStep);
  };

  // ── Step 3: validate ────────────────────────────────────────────────────

  const handleValidate = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setValidationResult('validating');
    setValidationError(null);
    try {
      await testConnection(selectedProvider, apiKey.trim());
      setValidationResult('success');
    } catch (err) {
      setValidationResult('error');
      setValidationError(
        err instanceof Error && err.message
          ? err.message
          : t('onboarding.wizard.step3ErrorFallback')
      );
    }
  };

  const handleSkipValidation = () => {
    setValidationResult('success'); // allow advancing
  };

  // ── Step 3 → Step 4 transition: connect the provider (2026-06-14 fix) ──
  //
  // Earlier this used to be in `handleFinish` (step 4 click). The problem
  // was that step 4 reads its model list from `useModels` (which holds
  // the user's connected providers) — so the user would arrive at
  // step 4 BEFORE the provider was connected, see an empty list
  // ("No hay modelos activos para X"), and the Empezar button would
  // be disabled. The fix: connect here in the step 3 → 4
  // transition. The Fase 2.1 event bus fires `useModels` refetch
  // automatically, and we also call `refetchModels()` explicitly as
  // belt-and-suspenders so step 4 has the list ready when it mounts.
  const handleAdvanceFromValidate = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    if (validationResult !== 'success') return;
    setConnecting(true);
    setSubmitError(null);
    try {
      const options: Record<string, unknown> = {};
      if (showAdvanced) {
        if (advancedOptions.baseURL) options.baseURL = advancedOptions.baseURL;
        if (advancedOptions.headers) options.headers = advancedOptions.headers;
        if (advancedOptions.endpoint) options.endpoint = advancedOptions.endpoint;
      }
      await handleConnect(
        selectedProvider,
        apiKey.trim(),
        Object.keys(options).length > 0 ? options : undefined
      );
      refetchModels();
      setCurrentStep(4);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t('onboarding.wizard.connectErrorFallback')
      );
    } finally {
      setConnecting(false);
    }
  };

  // ── Step 4: finalize ─────────────────────────────────────────────────────

  const handleFinish = async () => {
    if (!selectedProvider || !defaultModelId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Connection was already done in `handleAdvanceFromValidate`
      // (step 3 → 4 transition). All that's left is to lock in the
      // default model and close the wizard.
      onCompleted(selectedProvider, defaultModelId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodex = async () => {
    if (!selectedProvider) return;
    try {
      await handleCodexStart();
    } catch {
      // The error is already surfaced via codexNotice in useSettings.
    }
  };

  const stepTitle = (() => {
    switch (currentStep) {
      case 1:
        return t('onboarding.wizard.step1Title');
      case 2:
        return t('onboarding.wizard.step2Title');
      case 3:
        return t('onboarding.wizard.step3Title');
      case 4:
        return t('onboarding.wizard.step4Title');
    }
  })();

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="onboarding-wizard"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.wizard.aria')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
        }}
      >
        {/* Header: stepper + title */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div
            data-testid="onboarding-wizard-stepper"
            className="flex items-center gap-1.5 mb-3"
            aria-label={t('onboarding.wizard.stepAria', { current: currentStep })}
          >
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                aria-current={step === currentStep ? 'step' : undefined}
                data-testid={`step-indicator-${step}`}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{
                  backgroundColor: step <= currentStep ? 'var(--accent)' : 'var(--border)',
                }}
              />
            ))}
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>{stepTitle}</h2>
          <p className="mt-1" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {t('onboarding.wizard.stepLabel', { current: currentStep })}
          </p>
        </div>

        {/* Body */}
        <div
          data-testid={`wizard-step-${currentStep}-body`}
          style={{ padding: 20, maxHeight: 480, overflowY: 'auto' }}
        >
          {/* Submit / connect error (2026-06-14 fix): rendered at the
              top of the body so it shows in ANY step, not just step 4.
              Previously `submitError` only rendered inside the step 4
              body, so a failed connect at the step 3 → 4 transition
              would set the state but not show the error. */}
          {submitError && (
            <p
              data-testid="wizard-submit-error"
              role="alert"
              className="mb-3"
              style={{
                fontSize: 13,
                color: 'var(--m-rose)',
                padding: '8px 10px',
                borderRadius: 'var(--r-sm)',
                backgroundColor: 'rgba(208,119,160,0.06)',
                border: '1px solid rgba(208,119,160,0.3)',
              }}
            >
              {submitError}
            </p>
          )}

          {/* ── STEP 1: Provider picker ──────────────────────────────────── */}
          {currentStep === 1 && (
            <div>
              <p className="mb-3" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {t('onboarding.wizard.step1Body')}
              </p>
              {providersLoading && (
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {t('onboarding.wizard.step1Loading')}
                </p>
              )}
              {!providersLoading && popularProviders.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {popularProviders.map((p) => {
                    const isSel = p.id === selectedProvider;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProvider(p.id)}
                        data-testid={`provider-card-${p.id}`}
                        aria-pressed={isSel}
                        className="text-left p-3 rounded-md transition-colors"
                        style={{
                          border: isSel
                            ? '1px solid var(--accent-line)'
                            : '1px solid var(--border)',
                          backgroundColor: isSel ? 'var(--accent-quiet)' : 'transparent',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: 'var(--text-1)',
                            }}
                          >
                            {p.name}
                          </span>
                          {p.id === 'openai' && CODEX_ENABLED && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: 'var(--accent-quiet)',
                                color: 'var(--accent-text)',
                                border: '1px solid var(--accent-line)',
                              }}
                            >
                              {t('onboarding.wizard.step1Badge')}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {t('onboarding.wizard.step1ModelCount', {
                            count: p.modelCount,
                            kind: p.popular
                              ? t('onboarding.wizard.step1Popular')
                              : t('onboarding.wizard.step1Support'),
                          })}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Auth (API key OR OAuth branch) ─────────────────── */}
          {currentStep === 2 && (
            <div>
              {!isOAuthProvider && (
                <>
                  <p className="mb-2" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    <Trans
                      i18nKey="onboarding.wizard.step2PasteKey"
                      values={{ name: selectedProviderData?.name ?? selectedProvider ?? '' }}
                      components={{ accent: <strong style={{ color: 'var(--text-1)' }} /> }}
                    />
                  </p>
                  <div className="relative">
                    <input
                      data-testid="api-key-input"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-…"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full pr-10 pl-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-1)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => !s)}
                      aria-label={
                        showKey
                          ? t('onboarding.wizard.step2HideKey')
                          : t('onboarding.wizard.step2ShowKey')
                      }
                      data-testid="toggle-show-key"
                      className="absolute top-1/2 right-2 -translate-y-1/2 p-1"
                      style={{
                        color: 'var(--text-3)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {showKey ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 3l18 18M10.585 10.585a2 2 0 002.828 2.828M9.878 5.086A10.003 10.003 0 0112 5c7 0 10 7 10 7a13.16 13.16 0 01-1.67 2.68M6.61 6.61A13.526 13.526 0 003 12s3 7 10 7a9.74 9.74 0 005.39-1.61"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"
                          />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    data-testid="toggle-advanced"
                    className="mt-3 text-xs underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {showAdvanced
                      ? t('onboarding.wizard.step2AdvancedHide')
                      : t('onboarding.wizard.step2AdvancedShow')}
                  </button>

                  {showAdvanced && (
                    <div className="mt-2 space-y-2">
                      <input
                        data-testid="advanced-baseurl"
                        type="text"
                        placeholder={t('onboarding.wizard.step2AdvancedBaseUrl')}
                        value={advancedOptions.baseURL ?? ''}
                        onChange={(e) =>
                          setAdvancedOptions((o) => ({ ...o, baseURL: e.target.value }))
                        }
                        className="w-full px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          color: 'var(--text-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-sm)',
                        }}
                      />
                      <input
                        data-testid="advanced-headers"
                        type="text"
                        placeholder={t('onboarding.wizard.step2AdvancedHeaders')}
                        value={advancedOptions.headers ?? ''}
                        onChange={(e) =>
                          setAdvancedOptions((o) => ({ ...o, headers: e.target.value }))
                        }
                        className="w-full px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          color: 'var(--text-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-sm)',
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {isOAuthProvider && (
                <div
                  data-testid="wizard-oauth-branch"
                  className="rounded-md p-4"
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-app)',
                  }}
                >
                  <p className="text-sm" style={{ color: 'var(--text-1)' }}>
                    <Trans
                      i18nKey="onboarding.wizard.step2CodexTitle"
                      components={{ accent: <strong /> }}
                    />
                  </p>
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                    {t('onboarding.wizard.step2CodexBody')}
                  </p>
                  <button
                    type="button"
                    onClick={handleCodex}
                    disabled={codexConnecting}
                    data-testid="wizard-codex-button"
                    className="mt-3 text-sm font-medium px-4 py-2 rounded-md"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      border: '1px solid var(--accent-line)',
                      opacity: codexConnecting ? 0.7 : 1,
                      cursor: codexConnecting ? 'default' : 'pointer',
                    }}
                  >
                    {codexConnecting
                      ? t('onboarding.wizard.step2CodexButtonLoading')
                      : t('onboarding.wizard.step2CodexButton')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Validate ────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div>
              <p className="mb-3" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {t('onboarding.wizard.step3Body')}
              </p>

              {validationResult === 'idle' && (
                <div className="flex flex-col items-start gap-2">
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={!selectedProvider || !apiKey.trim()}
                    data-testid="wizard-validate-button"
                    className="text-sm font-medium px-4 py-2 rounded-md"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      border: '1px solid var(--accent-line)',
                      opacity: !selectedProvider || !apiKey.trim() ? 0.5 : 1,
                      cursor: !selectedProvider || !apiKey.trim() ? 'default' : 'pointer',
                    }}
                  >
                    {t('onboarding.wizard.step3Validate')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipValidation}
                    data-testid="wizard-skip-validation"
                    className="text-xs underline"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {t('onboarding.wizard.step3Skip')}
                  </button>
                </div>
              )}

              {validationResult === 'validating' && (
                <p data-testid="wizard-validating" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {t('onboarding.wizard.step3Validating')}
                </p>
              )}

              {validationResult === 'success' && (
                <div
                  data-testid="wizard-validation-success"
                  className="rounded-md p-3"
                  style={{
                    border: '1px solid rgba(92,176,139,0.32)',
                    backgroundColor: 'rgba(92,176,139,0.06)',
                    color: 'var(--m-green)',
                    fontSize: 13,
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('onboarding.wizard.step3Success')}
                  </span>
                </div>
              )}

              {validationResult === 'error' && (
                <div
                  data-testid="wizard-validation-error"
                  className="rounded-md p-3"
                  style={{
                    border: '1px solid rgba(208,119,160,0.32)',
                    backgroundColor: 'rgba(208,119,160,0.06)',
                    color: 'var(--m-rose)',
                    fontSize: 13,
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {validationError ?? t('onboarding.wizard.step3ErrorFallback')}
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleValidate}
                      data-testid="wizard-retry-validation"
                      className="text-xs underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {t('onboarding.wizard.step3Retry')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipValidation}
                      className="text-xs underline"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {t('onboarding.wizard.step3Skip')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Default model ────────────────────────────────────── */}
          {currentStep === 4 && (
            <div>
              <p className="mb-3" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {t('onboarding.wizard.step4Body')}
              </p>

              {modelsLoading && (
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {t('onboarding.wizard.step4Loading')}
                </p>
              )}

              {!modelsLoading &&
                (() => {
                  const providerModels = models.filter((m) => m.provider === selectedProvider);
                  if (providerModels.length === 0) {
                    return (
                      <div
                        data-testid="wizard-no-models"
                        className="rounded-md p-3"
                        style={{
                          border: '1px solid var(--m-amber)',
                          backgroundColor: 'rgba(207,154,94,0.06)',
                          color: 'var(--m-amber)',
                          fontSize: 13,
                        }}
                      >
                        <Trans
                          i18nKey="onboarding.wizard.step4NoModels"
                          values={{ name: selectedProviderData?.name ?? selectedProvider ?? '' }}
                          components={{
                            link: (
                              <a
                                href="/settings"
                                className="underline"
                                style={{ color: 'var(--accent)' }}
                              />
                            ),
                          }}
                        />
                      </div>
                    );
                  }
                  return (
                    <select
                      data-testid="wizard-model-select"
                      value={defaultModelId ?? ''}
                      onChange={(e) => setDefaultModelId(e.target.value)}
                      className="w-full px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-1)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      {providerModels.map((m) => (
                        <option key={`${m.provider}:${m.id}`} value={m.id}>
                          {m.name} ({m.provider})
                        </option>
                      ))}
                    </select>
                  );
                })()}
            </div>
          )}
        </div>

        {/* Footer: Atrás / Siguiente / Empezar */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-app)',
          }}
        >
          <button
            type="button"
            onClick={currentStep === 1 ? onClose : goBack}
            data-testid="wizard-back"
            disabled={submitting}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--text-2)',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {currentStep === 1 ? t('onboarding.wizard.cancel') : t('onboarding.wizard.back')}
          </button>

          {currentStep < 4 && (
            <button
              type="button"
              onClick={currentStep === 3 ? handleAdvanceFromValidate : goNext}
              data-testid="wizard-next"
              disabled={
                (currentStep === 1 && !selectedProvider) ||
                (currentStep === 2 && !isOAuthProvider && !apiKey.trim()) ||
                (currentStep === 3 && (validationResult !== 'success' || connecting))
              }
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                opacity: 1,
                cursor: currentStep === 3 && connecting ? 'default' : 'pointer',
              }}
            >
              {currentStep === 3 && connecting
                ? t('onboarding.wizard.nextConnecting')
                : t('onboarding.wizard.next')}
            </button>
          )}

          {currentStep === 4 && (
            <button
              type="button"
              onClick={handleFinish}
              data-testid="wizard-finish"
              disabled={submitting || !defaultModelId}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                opacity: submitting || !defaultModelId ? 0.5 : 1,
                cursor: submitting || !defaultModelId ? 'default' : 'pointer',
              }}
            >
              {submitting ? t('onboarding.wizard.startConnecting') : t('onboarding.wizard.start')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
