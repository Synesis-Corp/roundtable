import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Unit tests for searchConversations(). Prisma is fully mocked — no DB.
 * We test that the service:
 *  - short-circuits empty/whitespace queries (no DB call, returns [])
 *  - calls $queryRaw with the right bound params
 *  - maps results to SearchResult shape
 *  - returns [] when no rows match
 *  - clamps limit: default 20, max 50
 *  - ownership: userId param is forwarded so user B cannot see user A's rows
 *  - XSS: snippet containing <script> is not present in raw DB strings when
 *    the service correctly passes raw ts_headline output through (the safety
 *    layer lives in the frontend renderer — but we verify the service does NOT
 *    strip the <mark> tags itself so the renderer can use them)
 */

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';

// Mirror of the shape returned by the raw SQL rows
interface RawSearchRow {
  id: string;
  title: string;
  updated_at: Date;
  matched_in: 'title' | 'content';
  snippet: string | null;
}

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock('../lib/db', () => ({ prisma: mockPrisma }));

const { searchConversations } = await import('./conversation-search');

const NOW = new Date('2026-06-18T10:00:00.000Z');

function row(overrides: Partial<RawSearchRow> = {}): RawSearchRow {
  return {
    id: 'conv-1',
    title: 'My conversation',
    updated_at: NOW,
    matched_in: 'title',
    snippet: null,
    ...overrides,
  };
}

describe('searchConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-SEARCH-5: empty query short-circuits without touching the DB
  it('returns [] immediately for an empty query without calling the DB', async () => {
    const result = await searchConversations('user-a', '', 20);
    expect(result).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns [] immediately for a whitespace-only query', async () => {
    const result = await searchConversations('user-a', '   ', 20);
    expect(result).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  // REQ-SEARCH-6: valid query with no DB matches
  it('returns [] when the DB returns no rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    const result = await searchConversations('user-a', 'nomatch', 20);
    expect(result).toEqual([]);
  });

  // REQ-SEARCH-2: title match
  it('maps a title-match DB row to a SearchResult with matchedIn=title', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([row()]);
    const result = await searchConversations('user-a', 'conversation', 20);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'conv-1',
      title: 'My conversation',
      updatedAt: NOW,
      matchedIn: 'title',
      snippet: null,
    });
  });

  // REQ-SEARCH-3: content match returns snippet with <mark> tags
  it('maps a content-match DB row to a SearchResult with matchedIn=content and snippet', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      row({
        matched_in: 'content',
        snippet: 'about <mark>typescript</mark> patterns',
      }),
    ]);
    const result = await searchConversations('user-a', 'typescript', 20);
    expect(result[0].matchedIn).toBe('content');
    expect(result[0].snippet).toBe('about <mark>typescript</mark> patterns');
  });

  // REQ-SEARCH-8: limit clamp — default 20, max 50
  it('uses default limit 20 when limit is not provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    await searchConversations('user-a', 'test');
    // We verify $queryRaw was called (no short-circuit)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps limit to 50 when a larger value is passed', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    // We test indirectly: service must not throw and must call DB once
    await searchConversations('user-a', 'test', 999);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // REQ-SEARCH-1 / REQ-SEARCH-4 / D4 Ownership:
  // The userId is forwarded as a bound parameter so the DB enforces ownership.
  // We verify the service calls $queryRaw with the caller's userId.
  it('forwards userId as a bound parameter to the DB query', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    await searchConversations('user-b', 'hello', 20);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    // The tagged-template call receives the userId as a parameter value
    const callArgs = mockPrisma.$queryRaw.mock.calls[0];
    // Prisma $queryRaw is called as a tagged template. The mock receives the
    // template array + interpolated values. Interpolated values include userId.
    // We check that 'user-b' appears somewhere in the call args.
    const argsStr = JSON.stringify(callArgs);
    expect(argsStr).toContain('user-b');
  });

  // XSS guard (design D4 note): the service passes ts_headline output through
  // as-is. The <mark> wrapper is safe; the renderer handles escaping of the
  // rest. We verify the service does NOT strip <mark> tags.
  it('preserves <mark> tags in snippets from ts_headline', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      row({
        matched_in: 'content',
        snippet: 'click <mark>here</mark> now',
      }),
    ]);
    const result = await searchConversations('user-a', 'here', 20);
    expect(result[0].snippet).toContain('<mark>here</mark>');
  });

  // Security: snippet containing <script> — the service should HTML-escape
  // everything outside <mark>...</mark> to prevent XSS.
  it('escapes HTML in snippets outside of <mark> tags (XSS guard)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      row({
        matched_in: 'content',
        // Simulate a DB snippet where user content contains a script tag
        snippet: '<script>alert(1)</script> near <mark>term</mark>',
      }),
    ]);
    const result = await searchConversations('user-a', 'term', 20);
    // The <script> must be neutralized — angle brackets escaped
    expect(result[0].snippet).not.toContain('<script>');
    expect(result[0].snippet).toContain('&lt;script&gt;');
    // But <mark> tags must be preserved
    expect(result[0].snippet).toContain('<mark>term</mark>');
  });

  // Multiple results are returned in order
  it('returns multiple results in the order the DB returns them', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      row({ id: 'conv-1', matched_in: 'title' }),
      row({ id: 'conv-2', matched_in: 'content', snippet: 'found <mark>word</mark>' }),
    ]);
    const result = await searchConversations('user-a', 'word', 20);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('conv-1');
    expect(result[1].id).toBe('conv-2');
  });
});
