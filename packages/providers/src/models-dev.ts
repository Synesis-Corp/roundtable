/**
 * Single source of truth for models.dev metadata.
 *
 * The models.dev API (https://models.dev/api.json) returns an object keyed by
 * provider id, where each provider carries a `models` map. These types reflect
 * that real shape (an earlier stub assumed a flat `{providers,models}` payload
 * that the API never returns).
 *
 * This module is intentionally pure: it owns the fetch + in-memory cache and
 * exposes low-level accessors. It does NOT log or touch the router registry —
 * that wiring lives in the API layer so this package stays dependency-light.
 */

export interface ModelsDevModel {
  id: string;
  name: string;
  family: string;
  modalities: { input: string[]; output: string[] };
  limit: { context: number; output?: number };
  reasoning: boolean;
  tool_call: boolean;
  structured_output: boolean;
  attachment: boolean;
  release_date?: string;
  provider?: {
    npm?: string;
    api?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  env: string[];
  npm: string;
  api?: string;
  doc: string;
  models: Record<string, ModelsDevModel>;
}

const MODELS_DEV_API_URL = "https://models.dev/api.json";

let modelsDevCache: Map<string, ModelsDevProvider> | null = null;
let modelsDevFetchError: string | null = null;

/**
 * Fetches models.dev metadata into the module cache. Never throws — on failure
 * it records the error (readable via {@link getModelsDevFetchError}) so the
 * caller can decide how to log/surface it.
 */
export async function fetchModelsDev(): Promise<void> {
  try {
    const res = await fetch(MODELS_DEV_API_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Models.dev returned ${res.status}`);
    }
    const data = (await res.json()) as Record<string, ModelsDevProvider>;
    modelsDevCache = new Map(Object.entries(data));
    modelsDevFetchError = null;
  } catch (err) {
    modelsDevFetchError =
      err instanceof Error ? err.message : "Unknown error fetching Models.dev";
  }
}

/** The raw provider cache, or null if it was never (successfully) fetched. */
export function getModelsDevCache(): Map<string, ModelsDevProvider> | null {
  return modelsDevCache;
}

/** The last fetch error message, or null if the last fetch succeeded. */
export function getModelsDevFetchError(): string | null {
  return modelsDevFetchError;
}

/** Looks up a single provider's metadata by id. */
export function getModelsDevProvider(id: string): ModelsDevProvider | undefined {
  return modelsDevCache?.get(id);
}

/** The npm package adapter for a provider id (e.g. `@ai-sdk/openai`). */
export function getModelsDevNpm(id: string): string | undefined {
  return modelsDevCache?.get(id)?.npm;
}

/** The expected env var names for a provider id. */
export function getModelsDevEnv(id: string): string[] {
  return modelsDevCache?.get(id)?.env ?? [];
}

/** Number of providers currently cached. */
export function getModelsDevCacheSize(): number {
  return modelsDevCache?.size ?? 0;
}
