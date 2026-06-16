import { useState } from "react";
import { getInitials } from "../lib/initials";
import { CODEX_ENABLED } from "../lib/features";
import type { ProviderHealth } from "../hooks/useProvidersHealth";

const DEFAULT_ENDPOINTS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  togetherai: "https://api.together.xyz/v1",
  "fireworks-ai": "https://api.fireworks.ai/inference/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  perplexity: "https://api.perplexity.ai",
  cohere: "https://api.cohere.ai/compatibility/v1",
  xai: "https://api.x.ai/v1",
  minimax: "https://api.minimax.chat/v1",
  "minimax-coding-plan": "https://api.minimax.chat/v1",
  azure: "https://api.openai.azure.com",
};

export interface ProviderRowProps {
  provider: {
    id: string;
    name: string;
    npm: string;
    doc: string;
    env: string[];
    modelCount: number;
    popular?: boolean;
    models?: Array<{
      id: string;
      name: string;
      description: string;
      capabilities: string[];
    }>;
  };
  isConnected: boolean;
  /** Live health of this provider (only meaningful when connected). */
  health?: ProviderHealth;
  /** True while the health map is still loading — renders a "checking" dot. */
  healthLoading?: boolean;
  maskedKey: string;
  userOptions?: string;
  apiKey: string;
  showKey: boolean;
  onToggleShowKey: () => void;
  onApiKeyChange: (val: string) => void;
  onConnect: () => void;
  onTestConnection: () => void;
  onRequestDisconnect: () => void;
  onCodexConnect: () => void;
  saving: boolean;
  testing: boolean;
  codexConnecting: boolean;
  message: { text: string; type: "success" | "error" } | null;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  options: { baseURL?: string; headers?: string; endpoint?: string };
  onOptionsChange: (opts: { baseURL?: string; headers?: string; endpoint?: string }) => void;
  /** Opens the "Modelos activos" modal for this connected provider (#1). */
  onManageModels?: () => void;
}

function providerLogoUrl(providerId: string): string {
  return `https://models.dev/logos/${providerId}.svg`;
}

function parseProviderOptions(options?: string): Record<string, unknown> {
  if (!options) return {};
  try {
    const parsed = JSON.parse(options);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function ProviderLogo({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: 42,
        height: 42,
        borderRadius: "var(--r-sm)",
        background: "linear-gradient(150deg, #5b91d6, #7c6cf0 70%)",
      }}
    >
      {!failed && (
        <img
          src={providerLogoUrl(id)}
          alt=""
          className="h-6 w-6 object-contain"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <span className="text-[13px] font-bold text-white">{getInitials(name)}</span>
      )}
    </div>
  );
}

/**
 * Small status dot shown on a connected provider's "Conectado" badge.
 * Green = reachable, red = last probe failed (tooltip carries the error),
 * pulsing grey = still checking. Renders nothing until we have a signal.
 */
function HealthDot({ health, loading }: { health?: ProviderHealth; loading?: boolean }) {
  if (!health) {
    if (!loading) return null;
    return (
      <span
        role="img"
        aria-label="Comprobando estado del proveedor"
        title="Comprobando estado…"
        className="inline-block rounded-full animate-pulse"
        style={{ width: 7, height: 7, backgroundColor: "var(--text-4)" }}
      />
    );
  }
  const ok = health.ok;
  const label = ok ? "Proveedor operativo" : `Proveedor no disponible: ${health.error ?? "error desconocido"}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-block rounded-full"
      style={{ width: 7, height: 7, backgroundColor: ok ? "var(--m-green)" : "var(--m-rose)" }}
    />
  );
}

export function ProviderRow({
  provider,
  isConnected,
  health,
  healthLoading,
  maskedKey,
  userOptions,
  apiKey,
  showKey,
  onToggleShowKey,
  onApiKeyChange,
  onConnect,
  onTestConnection,
  onRequestDisconnect,
  onCodexConnect,
  saving,
  testing,
  codexConnecting,
  message,
  advancedOpen,
  onToggleAdvanced,
  options,
  onOptionsChange,
  onManageModels,
}: ProviderRowProps) {
  const connectedOptions = parseProviderOptions(userOptions);
  const usesCodex = connectedOptions.authType === "codex";
  const topModels = provider.models?.slice(0, 4) ?? [];
  const primaryEnv = provider.env[0];

  return (
    <article
      className="group transition-colors"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderLeft: isConnected ? "2px solid var(--m-green)" : "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: 16,
      }}
      onMouseEnter={(e) => {
        if (!isConnected) (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        if (!isConnected) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderLogo id={provider.id} name={provider.name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="truncate"
                style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}
              >
                {provider.name}
              </h2>
              <span
                className="font-mono-ui"
                style={{
                  fontSize: 12,
                  color: "var(--text-3)",
                }}
              >
                {provider.id}
              </span>
              {isConnected && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 font-medium"
                  style={{
                    fontSize: 11,
                    borderRadius: "var(--r-pill)",
                    backgroundColor: "rgba(92,176,139,0.14)",
                    color: "#5cb08b",
                  }}
                >
                  <HealthDot health={health} loading={healthLoading} />
                  Conectado
                </span>
              )}
              {usesCodex && (
                <span
                  className="inline-flex items-center px-2 py-0.5 font-medium"
                  style={{
                    fontSize: 11,
                    borderRadius: "var(--r-pill)",
                    backgroundColor: "rgba(91,145,214,0.14)",
                    color: "var(--m-blue)",
                  }}
                >
                  ChatGPT OAuth
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {provider.modelCount} modelos
              </span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span
                className="font-mono-ui"
                style={{ fontSize: 12, color: "var(--text-3)" }}
              >
                {provider.npm}
              </span>
              {provider.doc && (
                <>
                  <span style={{ color: "var(--text-4)" }}>·</span>
                  <a
                    href={provider.doc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline underline-offset-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                    style={{ color: "var(--accent)" }}
                  >
                    Docs
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        {isConnected && (
          <button
            onClick={onRequestDisconnect}
            disabled={saving}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
            aria-label="Desconectar proveedor"
          >
            {saving ? "..." : "Desconectar"}
          </button>
        )}
      </div>

      {/* Model chips */}
      {topModels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {topModels.map((model) => (
            <span
              key={model.id}
              title={model.description}
              className="inline-flex items-center px-2.5 py-1 font-medium"
              style={{
                fontSize: 11,
                borderRadius: "var(--r-pill)",
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-2)",
              }}
            >
              {model.name}
            </span>
          ))}
        </div>
      )}

      {isConnected ? (
        <div
          className="mt-3"
          style={{
            borderRadius: "var(--r-sm)",
            backgroundColor: "var(--bg-app)",
            border: "1px solid var(--border)",
            padding: "10px 12px",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Credencial</span>
            <span
              className="font-mono-ui"
              style={{ fontSize: 12, color: "var(--text-2)" }}
            >
              {maskedKey}
            </span>
            {userOptions && !usesCodex && (
              <span
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium"
                style={{
                  borderRadius: "var(--r-pill)",
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-3)",
                }}
              >
                config personalizada
              </span>
            )}
            {onManageModels && (
              <button
                type="button"
                onClick={onManageModels}
                className="ml-auto shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover-strong)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--bg-elevated)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)";
                }}
              >
                Modelos activos
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {provider.id === "openai" && CODEX_ENABLED && (
            <div
              style={{
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--accent-line)",
                backgroundColor: "var(--accent-quiet)",
                padding: 12,
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p
                    className="font-medium"
                    style={{ fontSize: 13, color: "var(--accent-text)" }}
                  >
                    ChatGPT Plus/Pro
                  </p>
                  <p className="mt-1" style={{ fontSize: 12, color: "var(--text-3)" }}>
                    Inicia sesión con OpenAI para usar modelos respaldados por Codex sin API key.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCodexConnect}
                  disabled={codexConnecting}
                  className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "#fff",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent)";
                  }}
                >
                  {codexConnecting ? "Abriendo..." : "Iniciar sesión con OpenAI"}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={primaryEnv ? `Pega tu ${primaryEnv}...` : "Pega tu API key..."}
                className="w-full text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                style={{
                  backgroundColor: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  color: "var(--text-1)",
                  padding: "10px 36px 10px 12px",
                  fontSize: 13,
                }}
              />
              {apiKey && (
                <button
                  type="button"
                  onClick={onToggleShowKey}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                  style={{ color: "var(--text-3)", borderRadius: "var(--r-xs)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                  }}
                  title={showKey ? "Ocultar clave" : "Mostrar clave"}
                  aria-label={showKey ? "Ocultar clave" : "Mostrar clave"}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showKey ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.5 10.5 0 0121 12c-.5 1.5-1.4 2.9-2.5 4M6.2 6.2A10.7 10.7 0 003 12c1.7 4.4 5 7 9 7 1.4 0 2.7-.3 3.9-.9" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.5 12C4.2 7.6 7.5 5 12 5s7.8 2.6 9.5 7c-1.7 4.4-5 7-9.5 7s-7.8-2.6-9.5-7zm9.5 3a3 3 0 100-6 3 3 0 000 6z" />
                    )}
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={onConnect}
              disabled={!apiKey.trim() || saving}
              className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                backgroundColor: "var(--accent)",
                color: "#fff",
              }}
              onMouseEnter={(e) => {
                if (apiKey.trim() && !saving) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent-hover)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent)";
              }}
            >
              {saving ? "Conectando..." : "Conectar"}
            </button>
            {apiKey.trim() && !saving && (
              <button
                onClick={onTestConnection}
                disabled={testing}
                className="shrink-0 rounded-lg px-4 py-2.5 text-xs font-medium transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover-strong)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--bg-elevated)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)";
                }}
              >
                {testing ? "Probando..." : "Probar"}
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <div
          className="mt-3 text-xs font-medium"
          style={{
            color: message.type === "success" ? "var(--m-green)" : "var(--m-rose)",
          }}
        >
          {message.text}
        </div>
      )}

      {!isConnected && (
        <button
          onClick={onToggleAdvanced}
          className="mt-3 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
          style={{ color: "var(--text-3)", borderRadius: "var(--r-xs)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
          }}
        >
          {advancedOpen ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
        </button>
      )}

      {advancedOpen && !isConnected && (
        <div
          className="mt-3 space-y-3"
          style={{
            borderRadius: "var(--r-sm)",
            backgroundColor: "var(--bg-app)",
            border: "1px solid var(--border)",
            padding: 16,
          }}
        >
          <div
            className="uppercase font-medium"
            style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--text-3)" }}
          >
            Configuración del proveedor
          </div>
          <div>
            <label className="mb-1 block" style={{ fontSize: 12, color: "var(--text-3)" }}>
              Paquete
            </label>
            <code
              className="font-mono-ui inline-block"
              style={{
                fontSize: 12,
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-2)",
                padding: "4px 8px",
                borderRadius: "var(--r-xs)",
              }}
            >
              {provider.npm}
            </code>
          </div>
          <div>
            <label className="mb-1 block" style={{ fontSize: 12, color: "var(--text-3)" }}>
              Endpoint por defecto
            </label>
            <code
              className="font-mono-ui block truncate"
              style={{
                fontSize: 12,
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-2)",
                padding: "4px 8px",
                borderRadius: "var(--r-xs)",
              }}
            >
              {DEFAULT_ENDPOINTS[provider.id] ?? "Standard provider endpoint"}
            </code>
          </div>
          <div>
            <label className="mb-1 block" style={{ fontSize: 12, color: "var(--text-3)" }}>
              Custom base URL
            </label>
            <input
              type="text"
              value={options.baseURL ?? ""}
              onChange={(e) => onOptionsChange({ ...options, baseURL: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                color: "var(--text-1)",
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label className="mb-1 block" style={{ fontSize: 12, color: "var(--text-3)" }}>
              Custom endpoint path
            </label>
            <input
              type="text"
              value={options.endpoint ?? ""}
              onChange={(e) => onOptionsChange({ ...options, endpoint: e.target.value })}
              placeholder="/v1/chat/completions"
              className="w-full text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                color: "var(--text-1)",
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label className="mb-1 block" style={{ fontSize: 12, color: "var(--text-3)" }}>
              Custom headers JSON
            </label>
            <textarea
              value={options.headers ?? ""}
              onChange={(e) => onOptionsChange({ ...options, headers: e.target.value })}
              placeholder='{"X-Custom-Header": "value"}'
              rows={3}
              className="w-full font-mono-ui text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
              style={{
                backgroundColor: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                color: "var(--text-1)",
                padding: "8px 12px",
              }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
