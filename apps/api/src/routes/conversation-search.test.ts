import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';

const TOKEN_A = jwt.sign({ userId: 'user-a' }, process.env.JWT_SECRET);
const TOKEN_B = jwt.sign({ userId: 'user-b' }, process.env.JWT_SECRET);

// Mock the search service — we tested it separately
const mockSearchConversations = vi.fn();
vi.mock('../lib/conversation-search', () => ({
  searchConversations: mockSearchConversations,
}));

// Mock db (needed transitively even though route delegates to the service)
const mockPrisma = vi.hoisted(() => ({
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));
vi.mock('../lib/db', () => ({ prisma: mockPrisma }));

const { default: conversationsRouter } = await import('./conversations');

const app = express();
app.use(express.json());
app.use('/conversations', conversationsRouter);

const authA = { Authorization: `Bearer ${TOKEN_A}` };
const authB = { Authorization: `Bearer ${TOKEN_B}` };

const sampleResult = {
  id: 'conv-1',
  title: 'Test conversation',
  updatedAt: new Date('2026-06-18T10:00:00.000Z'),
  matchedIn: 'title' as const,
  snippet: null,
};

describe('GET /conversations/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-SEARCH-1: unauthenticated → 401
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/conversations/search?q=test');
    expect(res.status).toBe(401);
    expect(mockSearchConversations).not.toHaveBeenCalled();
  });

  // REQ-SEARCH-5: empty q → 200 with empty results, no DB
  it('returns 200 with empty results for an empty q param', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    const res = await request(app).get('/conversations/search?q=').set(authA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  // REQ-SEARCH-2: title match returns results scoped to user-a
  it('returns 200 with scoped results for a valid query', async () => {
    mockSearchConversations.mockResolvedValueOnce([sampleResult]);
    const res = await request(app).get('/conversations/search?q=test').set(authA);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].id).toBe('conv-1');
    // Service was called with user-a's userId
    expect(mockSearchConversations).toHaveBeenCalledWith('user-a', 'test', 20);
  });

  // REQ-SEARCH-1 ownership: user B calls → service receives user-b
  it('passes user-b userId to the service for user-b token', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    await request(app).get('/conversations/search?q=hello').set(authB);
    expect(mockSearchConversations).toHaveBeenCalledWith('user-b', 'hello', 20);
  });

  // REQ-SEARCH-8: custom limit is clamped by the service
  it('passes a custom limit to the service', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    await request(app).get('/conversations/search?q=test&limit=10').set(authA);
    expect(mockSearchConversations).toHaveBeenCalledWith('user-a', 'test', 10);
  });

  it('defaults limit to 20 when not specified', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    await request(app).get('/conversations/search?q=test').set(authA);
    expect(mockSearchConversations).toHaveBeenCalledWith('user-a', 'test', 20);
  });

  // limit > 50 → route clamps before delegating
  it('clamps oversized limit to 50 before calling the service', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    await request(app).get('/conversations/search?q=test&limit=999').set(authA);
    expect(mockSearchConversations).toHaveBeenCalledWith('user-a', 'test', 50);
  });

  // Non-numeric limit → use default
  it('uses default limit 20 when limit param is not a valid number', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    await request(app).get('/conversations/search?q=test&limit=abc').set(authA);
    expect(mockSearchConversations).toHaveBeenCalledWith('user-a', 'test', 20);
  });

  // Route is NOT shadowed by /:id (Express ordering guard)
  // The word "search" must not be treated as a conversation id
  it('is not shadowed by /:id — search route resolves before id param', async () => {
    mockSearchConversations.mockResolvedValueOnce([]);
    const res = await request(app).get('/conversations/search?q=foo').set(authA);
    // If shadowed by /:id, findFirst would be called. It should NOT be.
    expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
