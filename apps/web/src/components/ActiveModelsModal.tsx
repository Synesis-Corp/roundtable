import { useEffect, useState } from "react";
import { useActiveModels } from "../hooks/useActiveModels";

export interface ActiveModelsModalProps {
  /** Provider whose models we're editing. `null` keeps the modal closed. */
  providerId: string | null;
  providerName: string;
  onClose: () => void;
  /** Called after a successful save (e.g. to refresh the model selector). */
  onSaved?: () => void;
}

/**
 * "Modelos activos" — lets the user pick, per connected provider, which models
 * are shown across the app (mejora #1). All selected = config-free default
 * ("show all"); a subset = an allow-list. Unselecting everything also resets to
 * "show all" server-side (we never hide a provider's whole catalog).
 */
export function ActiveModelsModal({
  providerId,
  providerName,
  onClose,
  onSaved,
}: ActiveModelsModalProps) {
  const { models, activeIds, loading, error, save } = useActiveModels(providerId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Empty activeIds means "all shown", so start with every model checked.
  useEffect(() => {
    setSelected(
      activeIds.length > 0 ? new Set(activeIds) : new Set(models.map((m) => m.id))
    );
  }, [models, activeIds]);

  if (!providerId) return null;

  const allSelected = models.length > 0 && selected.size === models.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // All selected → send [] (reset to "show all"); otherwise the subset.
      await save(allSelected ? [] : [...selected]);
      onSaved?.();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Modelos activos de ${providerName}`}
        className="w-full max-w-md overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 20, borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>
            Modelos activos · {providerName}
          </h2>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--text-3)" }}>
            Elegí qué modelos mostrar en todo el sistema. Con todos seleccionados se
            muestran todos.
          </p>
        </div>

        <div style={{ maxHeight: 360, overflowY: "auto", padding: "8px 12px" }}>
          {loading && (
            <p style={{ fontSize: 13, color: "var(--text-3)", padding: 12 }}>Cargando…</p>
          )}
          {error && !loading && (
            <p style={{ fontSize: 13, color: "var(--m-rose)", padding: 12 }}>{error}</p>
          )}
          {!loading && !error && models.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-3)", padding: 12 }}>
              No hay modelos disponibles para este proveedor.
            </p>
          )}
          {!loading &&
            models.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3"
                style={{ padding: "8px 8px", borderRadius: "var(--r-sm)" }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span className="min-w-0">
                  <span
                    className="block truncate"
                    style={{ fontSize: 13, color: "var(--text-1)" }}
                  >
                    {m.name}
                  </span>
                  <span
                    className="font-mono-ui block truncate"
                    style={{ fontSize: 11, color: "var(--text-3)" }}
                  >
                    {m.id}
                  </span>
                </span>
              </label>
            ))}
        </div>

        <div
          className="flex items-center justify-between gap-2"
          style={{ padding: 16, borderTop: "1px solid var(--border)" }}
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set(models.map((m) => m.id)))}
              style={{ fontSize: 12, color: "var(--text-3)" }}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              style={{ fontSize: 12, color: "var(--text-3)" }}
            >
              Ninguno
            </button>
          </div>
          <div className="flex items-center gap-2">
            {saveError && (
              <span style={{ fontSize: 12, color: "var(--m-rose)" }}>{saveError}</span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ color: "var(--text-3)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
