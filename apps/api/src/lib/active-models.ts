import type { ModelInfo } from "../services/model-registry";

const MAX_ACTIVE_MODELS = 200;

/**
 * Filters a flat model list against a per-provider allow-list (mejora #1).
 * A provider with NO entry (or an empty list) shows ALL of its models — the
 * filter only ever narrows providers the user explicitly configured, and an
 * empty list never hides everything (defensive).
 */
export function filterActiveModels(
  models: ModelInfo[],
  activeByProvider: Map<string, string[]>,
): ModelInfo[] {
  return models.filter((m) => {
    const active = activeByProvider.get(m.provider);
    if (!active || active.length === 0) return true;
    return active.includes(m.id);
  });
}

export type ValidateActiveModelsResult =
  | { ok: true; modelIds: string[] }
  | { ok: false; error: string };

/**
 * Validates the `modelIds` body of `PUT /providers/active-models/:providerId`.
 * An empty array is valid and means "reset to show all" (the route deletes the
 * row). De-duplicates while preserving the order the client sent.
 */
export function validateActiveModelIds(input: unknown): ValidateActiveModelsResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "modelIds must be an array" };
  }
  if (input.length > MAX_ACTIVE_MODELS) {
    return { ok: false, error: `modelIds cannot exceed ${MAX_ACTIVE_MODELS} entries` };
  }
  const seen = new Set<string>();
  const modelIds: string[] = [];
  for (const item of input) {
    if (typeof item !== "string" || item.trim() === "") {
      return { ok: false, error: "every modelId must be a non-empty string" };
    }
    if (!seen.has(item)) {
      seen.add(item);
      modelIds.push(item);
    }
  }
  return { ok: true, modelIds };
}
