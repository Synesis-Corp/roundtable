import { logger } from "./logger";

/** Normalized single-result returned by the web search client. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Successful response shape. On soft failure, `error` is set and `results` is empty. */
export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  took_ms: number;
  error?: string;
}

/** Internal type for the raw SearXNG JSON. The library only uses a small
 *  subset of fields, but we keep the type loose for forward compatibility. */
interface SearXngRawResult {
  title?: string;
  url?: string;
  content?: string;
}
interface SearXngRawResponse {
  query?: string;
  results?: SearXngRawResult[];
}

const TIMEOUT_MS = 5000;
// 8 (not 5) so the model gets enough context in ONE call to answer without
// firing follow-up searches. Thin result sets were the main driver of the
// "10 consultas" over-search loop: the model kept retrying because each
// search returned too few usable hits.
const DEFAULT_LIMIT = 8;

/**
 * Calls the configured SearXNG instance and returns a normalized result.
 * Never throws — any failure (timeout, non-2xx, parse error) is reported
 * via `WebSearchResponse.error` so the AI SDK tool wrapper can decide
 * whether to surface it to the model as a soft-failure result.
 */
export async function webSearch(
  query: string,
  opts: { limit?: number } = {},
): Promise<WebSearchResponse> {
  const start = Date.now();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const baseUrl = (process.env.SEARXNG_URL ?? "http://searxng:8080").replace(/\/+$/, "");
  // `safesearch=0` keeps news/current-events results from being filtered out.
  // `format=json` is required (SearXNG's default `html` returns 403 to the tool).
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&safesearch=0`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ tool: "web_search", query, status: res.status }, "web_search: non-2xx");
      return { query, results: [], took_ms: Date.now() - start, error: `Search unavailable (${res.status})` };
    }
    const text = await res.text();
    let raw: SearXngRawResponse;
    try {
      raw = JSON.parse(text) as SearXngRawResponse;
    } catch (err) {
      logger.warn({ tool: "web_search", query, err: String(err) }, "web_search: invalid JSON");
      return { query, results: [], took_ms: Date.now() - start, error: "Search returned invalid response" };
    }
    const results: WebSearchResult[] = (raw.results ?? [])
      .filter((r): r is Required<SearXngRawResult> => Boolean(r.title && r.url))
      .slice(0, limit)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: (r.content ?? "").slice(0, 500),
      }));
    return { query, results, took_ms: Date.now() - start };
  } catch (err) {
    logger.warn({ tool: "web_search", query, err: String(err) }, "web_search: network/timeout");
    return { query, results: [], took_ms: Date.now() - start, error: err instanceof Error ? err.message : "Search failed" };
  }
}
