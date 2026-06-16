import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ModelInfo } from "@chat/sdk";
import type { CouncilConfig } from "../hooks/useCouncilConfig";

/* ── Tier heuristics (same as backend) ── */
const LIGHT_HINTS = [
  "mini", "flash", "lite", "haiku", "nano", "small", "fast", "swift", "instant", "tiny",
];
const STRONG_HINTS = [
  "pro", "max", "reasoner", "thinking", "opus", "large", "ultra", "preview", "sonnet",
  "turbo", "flagship", "plus",
];

function computeTier(modelId: string): "strong" | "light" {
  const name = modelId.toLowerCase();
  if (LIGHT_HINTS.some((h) => name.includes(h))) return "light";
  if (STRONG_HINTS.some((h) => name.includes(h))) return "strong";
  return "strong";
}

function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    openai: "#5cb08b",
    deepseek: "#5b91d6",
    google: "#9079ec",
    anthropic: "#cf9a5e",
    groq: "#f27a7a",
    mistral: "#7eb8da",
    openrouter: "#d077a0",
    togetherai: "#b8a0e0",
    fireworks: "#e8a87c",
    perplexity: "#9ecfa0",
    cohere: "#a0c4e8",
    xai: "#e8a0a0",
    minimax: "#a0e8c4",
    azure: "#7ab8d0",
  };
  return colors[provider] || "#d077a0";
}

/* ── Auto-selection preview (same logic as ChatPage) ── */
function getAutoSelectedModels(models: ModelInfo[]): string[] {
  const grouped = new Map<string, ModelInfo[]>();
  for (const model of models) {
    if (model.capabilities && !model.capabilities.includes("text")) continue;
    const list = grouped.get(model.provider) ?? [];
    list.push(model);
    grouped.set(model.provider, list);
  }

  const selected: string[] = [];
  for (const [, providerModels] of grouped) {
    const sorted = [...providerModels].sort((a, b) => {
      const tierA = computeTier(a.id);
      const tierB = computeTier(b.id);
      if (tierA === "strong" && tierB !== "strong") return -1;
      if (tierB === "strong" && tierA !== "strong") return 1;
      return a.name.localeCompare(b.name);
    });
    const strong = sorted.find((m) => computeTier(m.id) === "strong") ?? sorted[0];
    if (strong) selected.push(`${strong.provider}:${strong.id}`);
    const remaining = sorted.filter((m) => m.id !== strong?.id);
    const light = remaining.find((m) => computeTier(m.id) === "light") ?? remaining[0];
    if (light) selected.push(`${light.provider}:${light.id}`);
  }
  return selected;
}

/* ── Validation ── */
function validateSelection(
  selectedIds: string[],
  models: ModelInfo[]
): { valid: boolean; error?: string } {
  if (selectedIds.length < 2) {
    return { valid: false, error: "Selecciona al menos 2 modelos" };
  }
  if (selectedIds.length > 8) {
    return { valid: false, error: "Máximo 8 modelos permitidos" };
  }

  const providers = new Set<string>();
  for (const rawId of selectedIds) {
    const model = models.find((m) => `${m.provider}:${m.id}` === rawId);
    if (model) providers.add(model.provider);
  }
  if (providers.size < 2) {
    return { valid: false, error: "Se necesitan al menos 2 proveedores diferentes" };
  }

  return { valid: true };
}

/* ── Component ── */
interface Props {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  currentConfig: CouncilConfig | null;
  onSave: (modelIds: string[], mode: "manual") => void | Promise<void>;
  onReset: () => void;
}

export function CouncilMembersModal({ open, onClose, models, currentConfig, onSave, onReset }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAuto, setIsAuto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Initialize from current config when opening
  useEffect(() => {
    if (open) {
      if (currentConfig?.mode === "manual" && currentConfig.modelIds.length >= 2) {
        setSelectedIds(new Set(currentConfig.modelIds));
        setIsAuto(false);
      } else {
        setSelectedIds(new Set(getAutoSelectedModels(models)));
        setIsAuto(true);
      }
      // Focus the close button when modal opens
      setTimeout(() => closeButtonRef.current?.focus(), 0);
    }
  }, [open, currentConfig, models]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap (simplified: keep focus inside modal)
  useEffect(() => {
    if (!open) return;
    const modal = modalRef.current;
    if (!modal) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const textModels = useMemo(() => {
    return models.filter((m) => m.capabilities?.includes("text"));
  }, [models]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const model of textModels) {
      const list = map.get(model.provider) ?? [];
      list.push(model);
      map.set(model.provider, list);
    }
    // Sort providers alphabetically
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [textModels]);

  const autoSelectedIds = useMemo(() => new Set(getAutoSelectedModels(models)), [models]);

  const activeSelection = isAuto ? autoSelectedIds : selectedIds;
  const validation = useMemo(
    () => validateSelection(Array.from(activeSelection), models),
    [activeSelection, models]
  );

  const toggleModel = useCallback((rawId: string) => {
    if (isAuto) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rawId)) next.delete(rawId);
      else next.add(rawId);
      return next;
    });
  }, [isAuto]);

  const handleSave = useCallback(async () => {
    if (isAuto) {
      setIsSubmitting(true);
      try {
        await onReset();
      } finally {
        setIsSubmitting(false);
      }
      onClose();
      return;
    }

    if (!validation.valid) return;
    setSaveError(null);
    setIsSubmitting(true);
    try {
      // Await so a backend rejection (e.g. an unsupported modelId format)
      // keeps the modal open with a visible error instead of closing silently.
      await onSave(Array.from(selectedIds), "manual");
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar la configuración");
    } finally {
      setIsSubmitting(false);
    }
  }, [isAuto, onReset, onSave, selectedIds, validation.valid, onClose]);

  const handleToggleAuto = useCallback(() => {
    setIsAuto((prev) => {
      const next = !prev;
      if (next) {
        // Switching to auto: remember current selection but show auto
        setSelectedIds((current) => {
          // Keep current as fallback, but auto mode will use autoSelectedIds
          return current;
        });
      }
      return next;
    });
  }, []);

  if (!open) return null;

  const selectedCount = activeSelection.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Miembros del Consejo">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-md)",
          margin: "16px",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
            Miembros del Consejo
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
            style={{ color: "var(--text-3)" }}
            aria-label="Cerrar"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Counter + Toggle */}
        <div className="px-5 pt-4 pb-2 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-2)" }}>
              <span className="font-semibold" style={{ color: "var(--text-1)" }}>{selectedCount}</span>{" "}
              {selectedCount === 1 ? "seleccionado" : "seleccionados"} · mínimo 2 · máximo 8
            </span>
          </div>

          {/* Auto toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={isAuto}
                onChange={handleToggleAuto}
                className="sr-only peer"
              />
              <div
                className="w-10 h-6 rounded-full transition-colors peer-focus:ring-2 peer-focus:ring-[var(--accent)] peer-focus:ring-offset-2 peer-focus:ring-offset-[var(--bg-surface)]"
                style={{
                  backgroundColor: isAuto ? "var(--accent)" : "var(--border-strong)",
                }}
              >
                <div
                  className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: isAuto ? "translateX(16px)" : "translateX(0)" }}
                />
              </div>
            </div>
            <span className="text-sm" style={{ color: "var(--text-2)" }}>Usar selección automática</span>
          </label>

          {isAuto && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Los modelos se eligen automáticamente según los proveedores conectados.
            </p>
          )}

          {/* Validation / save error message */}
          {!isAuto && (validation.error || saveError) && (
            <div
              className="text-xs px-3 py-2 rounded-md"
              style={{
                backgroundColor: "rgba(208,119,160,0.08)",
                color: "var(--m-rose)",
                border: "1px solid rgba(208,119,160,0.15)",
              }}
            >
              {validation.error ?? saveError}
            </div>
          )}
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {textModels.length === 0 && (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>
              No hay modelos de texto disponibles.
            </div>
          )}

          {Array.from(grouped.entries()).map(([provider, providerModels]) => (
            <div key={provider} className="mb-4">
              {/* Provider header */}
              <div className="flex items-center gap-2 mb-2 sticky top-0 py-1"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getProviderColor(provider) }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-2)" }}
                >
                  {provider}
                </span>
              </div>

              <div className="space-y-1">
                {providerModels.map((model) => {
                  const rawId = `${model.provider}:${model.id}`;
                  const isChecked = activeSelection.has(rawId);
                  const tier = computeTier(model.id);
                  const isDisabled = isAuto || !model.capabilities?.includes("text");

                  return (
                    <label
                      key={rawId}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${!isDisabled ? "cursor-pointer" : "cursor-default"}`}
                      style={{
                        backgroundColor: isChecked && !isAuto ? "var(--accent-quiet)" : "transparent",
                        opacity: isDisabled ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isDisabled && !isChecked) {
                          (e.currentTarget as HTMLLabelElement).style.backgroundColor = "var(--hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDisabled && !isChecked) {
                          (e.currentTarget as HTMLLabelElement).style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleModel(rawId)}
                        disabled={isDisabled}
                        className="mt-0.5 shrink-0 w-4 h-4 rounded border-gray-500 text-[var(--accent)] focus:ring-[var(--accent)]"
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>
                            {model.name}
                          </span>
                          <span
                            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: tier === "strong" ? "rgba(92,176,139,0.12)" : "rgba(111,123,242,0.12)",
                              color: tier === "strong" ? "var(--m-green)" : "var(--accent)",
                            }}
                          >
                            {tier === "strong" ? "Fuerte" : "Liviano"}
                          </span>
                        </div>
                        <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-3)" }}>
                          {model.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
            style={{
              color: "var(--text-2)",
              backgroundColor: "transparent",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={(!isAuto && !validation.valid) || isSubmitting}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--accent)",
              color: "#fff",
            }}
            onMouseEnter={(e) => {
              if (!(!isAuto && !validation.valid) && !isSubmitting) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent-hover)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent)";
            }}
          >
            {isSubmitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
