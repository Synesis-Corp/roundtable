import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearch } from "./web-search";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(response: { status: number; body: unknown } | { error: string }): void {
  if ("error" in response) {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error(response.error)) as unknown as typeof fetch;
    return;
  }
  globalThis.fetch = vi.fn().mockResolvedValueOnce(
    new Response(typeof response.body === "string" ? response.body : JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("webSearch", () => {
  beforeEach(() => {
    process.env.SEARXNG_URL = "http://searxng:8080";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns normalized results on 200 with valid SearXNG JSON", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        query: "Ecuador news today",
        results: [
          { title: "El Universo", url: "https://eluniverso.com/x", content: "Top story about Ecuador politics" },
          { title: "El Comercio", url: "https://elcomercio.com/y", content: "Breaking news about Ecuador" },
        ],
      },
    });

    const result = await webSearch("Ecuador news today");

    expect(result.query).toBe("Ecuador news today");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "El Universo",
      url: "https://eluniverso.com/x",
      snippet: "Top story about Ecuador politics",
    });
    expect(result.error).toBeUndefined();
    expect(result.took_ms).toBeGreaterThanOrEqual(0);
  });

  it("requests SearXNG with format=json + safesearch=0 and caps results at 8", async () => {
    const manyResults = Array.from({ length: 12 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `snippet ${i}`,
    }));
    mockFetchOnce({ status: 200, body: { query: "noticias ecuador", results: manyResults } });

    const result = await webSearch("noticias ecuador");

    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("safesearch=0");
    expect(calledUrl).toContain(encodeURIComponent("noticias ecuador"));
    // 12 hits returned by SearXNG → tool caps at the 8-result default.
    expect(result.results).toHaveLength(8);
  });

  it("returns { error } on 5xx (soft failure, not throw)", async () => {
    mockFetchOnce({ status: 503, body: { error: "upstream down" } });

    const result = await webSearch("anything");

    expect(result.error).toBeDefined();
    expect(result.query).toBe("anything");
    expect(result.results).toEqual([]);
  });

  it("returns { error } on invalid JSON (SearXNG returning HTML)", async () => {
    mockFetchOnce({ status: 200, body: "<html>error page</html>" });

    const result = await webSearch("anything");

    expect(result.error).toBeDefined();
    expect(result.query).toBe("anything");
    expect(result.results).toEqual([]);
  });

  it("returns { error } on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const result = await webSearch("anything");

    expect(result.error).toBeDefined();
    expect(result.query).toBe("anything");
    expect(result.results).toEqual([]);
  });
});
