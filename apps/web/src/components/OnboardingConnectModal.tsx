import { useEffect, useState } from "react";
import { useProviders } from "../hooks/useProviders";
import { useSettings } from "../hooks/useSettings";

interface OnboardingConnectModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the modal should close (backdrop click, Cancel, ESC, success). */
  onClose: () => void;
}

/**
 * "Conectar proveedor" — modal presentacional que aparece desde el CTA de
 * Onboarding Fase 1 (Fase 2.2). El usuario elige un provider popular y
 * pega una API key sin salir del welcome.
 *
 * Reusa `useSettings.handleConnect` (que ya hace POST /providers +
 * `clearIsNewFlag` + `emitProvidersChanged` del event bus de Fase 2.1).
 * Cero backend, cero migración.
 */
export function OnboardingConnectModal({ open, onClose }: OnboardingConnectModalProps) {
  const { popularProviders, loading: providersLoading, error: providersError } = useProviders();
  const { handleConnect } = useSettings();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset state every time the modal opens. The dependency is `open`
  // only — NOT `popularProviders`, which is a fresh array reference on
  // every render (and would re-trigger the reset after every state
  // change, wiping user input).
  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setError(null);
    setShowKey(false);
    setSubmitting(false);
  }, [open]);

  // Auto-pick the first popular provider when available. Separate effect
  // so it can react to `popularProviders` (e.g. if the list is still
  // loading on open) without clobbering user input. Only fires when no
  // provider is selected yet.
  useEffect(() => {
    if (open && !providerId && popularProviders[0]) {
      setProviderId(popularProviders[0].id);
    }
  }, [open, popularProviders, providerId]);

  if (!open) return null;

  const selectedProvider = popularProviders.find((p) => p.id === providerId) ?? null;
  // Button is always clickable. Empty/missing state is validated in
  // `handleSubmit` and shown as an inline error — same pattern as
  // `ConfirmActionModal`. Disabled by `submitting` (in-flight) only.
  const submittingBlocked = submitting;

  const handleSubmit = async () => {
    if (!providerId || !apiKey.trim()) {
      setError("Pegá una API key para continuar.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await handleConnect(providerId, apiKey.trim());
      // On success: handleConnect updates userProviders → onboarding.kind
      // becomes "hidden" → the CTA unmounts. We close the modal so the
      // user can see the (now populated) model selector immediately.
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="onboarding-connect-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Conectar proveedor"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>
            Conectar proveedor
          </h2>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--text-3)" }}>
            Pegá tu API key para empezar. Para opciones avanzadas (Codex OAuth, baseURL custom),
            andá a Configuración.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: 20, maxHeight: 480, overflowY: "auto" }}>
          {/* Provider picker */}
          <p className="mb-2" style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
            Provider
          </p>
          {providersLoading && (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>Cargando…</p>
          )}
          {providersError && !providersLoading && (
            <div
              role="alert"
              style={{
                padding: "10px 12px",
                borderRadius: "var(--r-sm)",
                border: "1px solid rgba(208,119,160,0.3)",
                backgroundColor: "rgba(208,119,160,0.06)",
                color: "var(--m-rose)",
                fontSize: 13,
              }}
            >
              {providersError}.{" "}
              <a
                href="/settings"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                Ir a Configuración
              </a>
            </div>
          )}
          {!providersLoading && !providersError && popularProviders.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>
              No hay providers populares disponibles.{" "}
              <a href="/settings" className="underline" style={{ color: "var(--accent)" }}>
                Ver todos
              </a>
            </p>
          )}
          {!providersLoading && popularProviders.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {popularProviders.map((p) => {
                const isSel = p.id === providerId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProviderId(p.id);
                      setError(null);
                    }}
                    aria-pressed={isSel}
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      padding: "6px 12px",
                      borderRadius: "var(--r-pill)",
                      border: isSel
                        ? "1px solid var(--accent-line)"
                        : "1px solid var(--border)",
                      backgroundColor: isSel ? "var(--accent-quiet)" : "transparent",
                      color: isSel ? "var(--accent-text)" : "var(--text-2)",
                      cursor: "pointer",
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* API key input */}
          <p className="mb-2" style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
            API key {selectedProvider ? `de ${selectedProvider.name}` : ""}
          </p>
          <div className="relative">
            <input
              data-testid="api-key-input"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (error) setError(null);
              }}
              placeholder={selectedProvider ? `sk-…` : "sk-…"}
              autoComplete="off"
              spellCheck={false}
              className="w-full pr-10 pl-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
              style={{
                backgroundColor: "var(--bg-input)",
                color: "var(--text-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? "Ocultar API key" : "Mostrar API key"}
              className="absolute top-1/2 right-2 -translate-y-1/2 p-1"
              style={{ color: "var(--text-3)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              {showKey ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.585 10.585a2 2 0 002.828 2.828M9.878 5.086A10.003 10.003 0 0112 5c7 0 10 7 10 7a13.16 13.16 0 01-1.67 2.68M6.61 6.61A13.526 13.526 0 003 12s3 7 10 7a9.74 9.74 0 005.39-1.61" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {/* Error inline */}
          {error && (
            <p
              data-testid="onboarding-connect-error"
              role="alert"
              className="mt-3"
              style={{
                fontSize: 13,
                color: "var(--m-rose)",
                padding: "8px 10px",
                borderRadius: "var(--r-sm)",
                backgroundColor: "rgba(208,119,160,0.06)",
                border: "1px solid rgba(208,119,160,0.3)",
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            backgroundColor: "var(--bg-app)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submittingBlocked}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 14px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              color: "var(--text-2)",
              cursor: submittingBlocked ? "default" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submittingBlocked}
            data-testid="onboarding-connect-submit"
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: "var(--r-sm)",
              border: "none",
              backgroundColor: "var(--accent)",
              color: "#fff",
              opacity: submittingBlocked ? 0.7 : 1,
              cursor: submittingBlocked ? "default" : "pointer",
            }}
          >
            {submittingBlocked ? "Conectando…" : "Conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
