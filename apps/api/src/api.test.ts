import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { route } from '@chat/router';
import { getProvider } from './lib/provider-registry';

// Must be set before importing the app: auth resolves JWT_SECRET lazily and
// rejects anything shorter than 32 chars (no insecure fallback exists anymore).
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const TEST_TOKEN = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET);
const TEST_TOKEN_2 = jwt.sign({ userId: 'test-user-2' }, process.env.JWT_SECRET);
const TEST_ADMIN_TOKEN = jwt.sign(
  { userId: 'admin-user', email: 'admin@example.com' },
  process.env.JWT_SECRET
);
const TEST_NON_ADMIN_TOKEN = jwt.sign(
  { userId: 'regular-user', email: 'user@example.com' },
  process.env.JWT_SECRET
);

/** Parse raw SSE text into an array of JSON payloads. */
function parseSSE(text: string): Array<Record<string, unknown>> {
  const lines = text.split('\n');
  const events: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ')) {
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;
      try {
        events.push(JSON.parse(payload));
      } catch {
        // ignore malformed lines
      }
    }
  }
  return events;
}

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  providerConfig: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  },
  message: {
    create: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  usageEvent: {
    create: vi.fn(() => Promise.resolve({ id: 'usage-1' })),
    groupBy: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
  },
  councilTurn: {
    create: vi.fn(),
  },
  councilVoice: {
    create: vi.fn(),
  },
  councilConfig: {
    findUnique: vi.fn(() => Promise.resolve(null)),
    upsert: vi.fn(),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  },
  activeModelsConfig: {
    findMany: vi.fn(() => Promise.resolve([])),
    findUnique: vi.fn(() => Promise.resolve(null)),
    upsert: vi.fn(),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  },
  capabilityEntry: {
    findMany: vi.fn(() => Promise.resolve([])),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    createMany: vi.fn(() => Promise.resolve({ count: 0 })),
  },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),
};

vi.mock('@chat/db', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('@chat/router', () => ({
  route: vi.fn(() => ({
    primary: { provider: 'openai', modelId: 'gpt-4o' },
    fallbacks: [],
  })),
  registerModel: vi.fn(),
  getAllModels: vi.fn(() => []),
  isCouncilEligible: vi.fn((provider: string, modelId: string) => {
    // Mirror the matrix: openai excludes dall-e-3, gpt-image-1, whisper-1, tts-1, embeddings
    if (provider === 'openai') {
      return !['dall-e-3', 'gpt-image-1', 'whisper-1', 'tts-1', 'text-embedding-3-small'].includes(
        modelId
      );
    }
    return true;
  }),
  isUseCaseEligible: vi.fn((provider: string, modelId: string) => {
    // Non-chat openai models are excluded from every use case in the real matrix.
    if (provider === 'openai') {
      return !['dall-e-3', 'gpt-image-1', 'whisper-1', 'tts-1', 'text-embedding-3-small'].includes(
        modelId
      );
    }
    return true;
  }),
  defaultTierFor: vi.fn((provider: string) => {
    if (provider === 'groq' || provider === 'perplexity' || provider === 'opencode') return 'light';
    return 'strong';
  }),
  findCapableModels: vi.fn((modalities: string[] = ['text']) => {
    // Surface multiple capabilities so the Council mode can pick at least 2
    // models during tests.
    if (modalities.includes('text')) {
      return [
        {
          provider: 'openai',
          modelId: 'gpt-4o',
          modalities: ['text', 'image'],
          features: ['tool-use', 'reasoning', 'vision'],
          contextWindow: 128000,
        },
        {
          provider: 'deepseek',
          modelId: 'deepseek-chat',
          modalities: ['text'],
          features: ['tool-use', 'reasoning'],
          contextWindow: 64000,
        },
      ];
    }
    return [];
  }),
  getEffortSpec: vi.fn((provider: string, _modelId: string, metadata?: { reasoning?: boolean }) => {
    if (provider !== 'openai' || !metadata?.reasoning) return null;
    return {
      variants: [
        { id: 'low', label: 'low', options: { reasoningEffort: 'low' } },
        { id: 'high', label: 'high', options: { reasoningEffort: 'high' } },
      ],
    };
  }),
  getModel: vi.fn(),
}));

vi.mock('@chat/crypto', () => ({
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => s.replace('enc:', '')),
  maskKey: vi.fn((s: string) => s.slice(0, 4) + '...' + s.slice(-4)),
}));

vi.mock('@chat/providers', () => ({
  fetchModelsDev: vi.fn(() => Promise.resolve()),
  getModelsDevCache: vi.fn(() => null),
  getModelsDevFetchError: vi.fn(() => null),
}));

const { gm } = vi.hoisted(() => {
  const gm = { verifyIdToken: vi.fn() };
  return { gm };
});
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(() => ({ verifyIdToken: gm.verifyIdToken })),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('hashed-password')),
    compare: vi.fn(() => Promise.resolve(true)),
  },
}));

vi.mock('./lib/provider-registry', () => ({
  getProvider: vi.fn(() => ({
    chat: vi.fn(() =>
      Promise.resolve({
        content: 'Hello!',
        model: 'gpt-4o',
        provider: 'openai',
        tokensUsed: 10,
        inputTokens: 4,
        outputTokens: 6,
        latencyMs: 100,
      })
    ),
    streamChat: vi.fn(async function* () {
      yield { token: 'Hello', model: 'gpt-4o', provider: 'openai', isFinished: false };
      yield {
        token: '!',
        model: 'gpt-4o',
        provider: 'openai',
        isFinished: true,
        usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      };
    }),
    chatStructured: vi.fn(() =>
      Promise.resolve({
        object: { vote: 'gpt-4o', reason: 'best balance', improvement: 'add a table' },
        model: 'gpt-4o',
        provider: 'openai',
        tokensUsed: 10,
        inputTokens: 4,
        outputTokens: 6,
        latencyMs: 100,
      })
    ),
    getCapabilities: vi.fn(() => [
      {
        modelId: 'gpt-4o',
        provider: 'openai',
        modalities: ['text', 'image'],
        features: ['tool-use', 'vision'],
        contextWindow: 128000,
      },
    ]),
  })),
}));

// Dynamic import app after mocks are set up
const { app } = await import('./index');
// Same — provider-health pulls in lib/db, so import it after the @chat/db mock.
const { providerHealthCache } = await import('./lib/provider-health');

// Block unexpected outbound network calls during integration tests.
// /usage triggers model-pricing which would otherwise hit OpenRouter.
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response))
);

describe('API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('trusts the configured reverse-proxy hop count (default 1) for client IP / proto', () => {
    // Regression guard: without trust proxy, express-rate-limit keys every
    // request to the nginx IP (one global bucket) and `req.secure` is wrong
    // behind TLS termination. Hop count is env-driven (TRUST_PROXY) so the same
    // image is portable; with no env set the default is 1 (no IP spoofing).
    expect(app.get('trust proxy')).toBe(1);
  });

  it('POST /auth/register creates a user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
    });

    const res = await request(app).post('/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('POST /auth/register rejects password shorter than 8 characters', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'test@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details?.password?.[0]).toContain('at least 8');
  });

  it('POST /auth/login returns token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'login@example.com',
      passwordHash: 'hashed-password',
    });

    const res = await request(app).post('/auth/login').send({
      email: 'login@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('runs a password comparison for unknown emails (timing-safe enumeration guard)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/auth/login').send({
      email: 'ghost@example.com',
      password: 'whatever',
    });

    expect(res.status).toBe(401);
    // The bcrypt comparison must still run for a non-existent account so the
    // response time can't reveal whether the email is registered.
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  // ─── Multipart Image Upload Tests ───────────────────────────────────────

  describe('POST /chat (multipart)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Analyze this:',
        modelUsed: 'gpt-4o',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    });

    it('accepts multipart form-data with file and messages', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Describe this' }]))
        .attach('files', Buffer.from('fake-png-data'), 'test.png');

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello!');
      expect(res.body.provider).toBe('openai');
    });

    it("defaults content to 'Analyze this:' when user message has no text", async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: '' }]))
        .attach('files', Buffer.from('fake-png-data'), 'test.png');

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello!');
    });

    it('returns 400 when messages field is missing in multipart', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .attach('files', Buffer.from('fake-png-data'), 'test.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing 'messages'");
    });

    it('returns 400 when messages JSON is invalid', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', 'not-valid-json')
        .attach('files', Buffer.from('fake-png-data'), 'test.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid JSON');
    });

    it('returns 400 when messages is an empty array', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', '[]')
        .attach('files', Buffer.from('fake-png-data'), 'test.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty array');
    });

    it("returns 404 when user tries to write to another user's conversation", async () => {
      // user-2 tries to write to a conversation owned by test-user
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const otherAuthHeader = { Authorization: `Bearer ${TEST_TOKEN_2}` };
      const res = await request(app)
        .post('/chat')
        .set(otherAuthHeader)
        .set('Content-Type', 'application/json')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversationId: 'conv-owned-by-test-user',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Conversation not found');
      // Verify no messages were persisted
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /chat/stream (multipart)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Analyze this:',
        modelUsed: 'gpt-4o',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    });

    it('streams SSE via multipart with file', async () => {
      const res = await request(app)
        .post('/chat/stream')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Hi' }]))
        .attach('files', Buffer.from('fake-png-data'), 'photo.png')
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            cb(null, data);
          });
        });

      expect(res.status).toBe(200);
      expect(res.body).toContain('data: ');
      expect(res.body).toContain('Hello');
    });

    it("returns 404 when user tries to stream to another user's conversation", async () => {
      // user-2 tries to write to a conversation owned by test-user
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const otherAuthHeader = { Authorization: `Bearer ${TEST_TOKEN_2}` };
      const res = await request(app)
        .post('/chat/stream')
        .set(otherAuthHeader)
        .set('Content-Type', 'application/json')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversationId: 'conv-owned-by-test-user',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Conversation not found');
    });

    it('propagates provider stream error as SSE error event', async () => {
      vi.mocked(getProvider).mockReturnValueOnce({
        chat: vi.fn(() =>
          Promise.resolve({
            content: 'Hello!',
            model: 'gpt-4o',
            provider: 'openai',
            tokensUsed: 10,
            latencyMs: 100,
          })
        ),
        streamChat: vi.fn(async function* () {
          yield { token: 'Hel', model: 'gpt-4o', provider: 'openai', isFinished: false };
          throw new Error('Provider API failure');
        }),
      } as never);

      const res = await request(app)
        .post('/chat/stream')
        .set(authHeader)
        .set('Content-Type', 'application/json')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            cb(null, data);
          });
        });

      expect(res.status).toBe(200);
      const events = parseSSE(res.body as string);
      const errorEvent = events.find((e) => e.error);
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.error).toBe('Provider API failure');
    });

    it('auto-retries with the next candidate when the upstream rejects the primary on iteration (Post-deploy #1 v2)', async () => {
      // The router ranks a phantom primary (gpt-5.2-pro — known to Models.dev
      // but not actually released) ahead of a real fallback. The upstream 404 /
      // "not a chat model" surfaces while CONSUMING the async-generator stream,
      // NOT when streamChat() is invoked — so the retry must fire from inside
      // the for-await. (The previous fix only wrapped the synchronous call,
      // which never throws for async generators: it was dead code.)
      vi.mocked(route).mockReturnValueOnce({
        primary: { provider: 'openai', modelId: 'gpt-5.2-pro' },
        fallbacks: [{ provider: 'openai', modelId: 'gpt-4o' }],
      } as never);

      // First resolution (primary) → a stream that rejects on first .next()
      // before emitting any token. Second (fallback) → streams a real answer.
      vi.mocked(getProvider)
        .mockReturnValueOnce({
          id: 'openai',
          streamChat: vi.fn(async function* () {
            await Promise.reject(
              new Error(
                'This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?'
              )
            );
            yield { token: '', model: 'gpt-5.2-pro', provider: 'openai', isFinished: true };
          }),
        } as never)
        .mockReturnValueOnce({
          id: 'openai',
          streamChat: vi.fn(async function* () {
            yield { token: 'Real', model: 'gpt-4o', provider: 'openai', isFinished: false };
            yield {
              token: ' answer',
              model: 'gpt-4o',
              provider: 'openai',
              isFinished: true,
              usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
            };
          }),
        } as never);

      const res = await request(app)
        .post('/chat/stream')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Hola' }],
          preferences: { incognito: true },
        })
        .buffer(true)
        .parse((response, cb) => {
          let data = '';
          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          response.on('end', () => cb(null, data));
        });

      expect(res.status).toBe(200);
      const events = parseSSE(res.body as string);
      // No error event surfaced to the user: the retry swapped models cleanly.
      expect(events.find((event) => event.error)).toBeUndefined();
      // The fallback model's real answer reached the client.
      const text = events.map((event) => event.token ?? '').join('');
      expect(text).toContain('Real answer');
    });

    it('does NOT retry once tokens have already streamed (avoids duplicated output)', async () => {
      // If the model emits content and THEN errors, retrying would duplicate
      // what the user already saw. The guard must surface the error instead.
      vi.mocked(route).mockReturnValueOnce({
        primary: { provider: 'openai', modelId: 'gpt-4o' },
        fallbacks: [{ provider: 'openai', modelId: 'deepseek-chat' }],
      } as never);

      vi.mocked(getProvider)
        .mockReturnValueOnce({
          id: 'openai',
          streamChat: vi.fn(async function* () {
            yield { token: 'Half', model: 'gpt-4o', provider: 'openai', isFinished: false };
            throw new Error('model gpt-4o does not exist');
          }),
        } as never)
        .mockReturnValueOnce({
          id: 'deepseek',
          streamChat: vi.fn(async function* () {
            yield {
              token: 'SHOULD-NOT-APPEAR',
              model: 'deepseek-chat',
              provider: 'deepseek',
              isFinished: true,
            };
          }),
        } as never);

      const res = await request(app)
        .post('/chat/stream')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Hola' }],
          preferences: { incognito: true },
        })
        .buffer(true)
        .parse((response, cb) => {
          let data = '';
          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          response.on('end', () => cb(null, data));
        });

      expect(res.status).toBe(200);
      const events = parseSSE(res.body as string);
      // The partial token is kept; the error is surfaced; no swap to the fallback.
      const text = events.map((event) => event.token ?? '').join('');
      expect(text).toContain('Half');
      expect(text).not.toContain('SHOULD-NOT-APPEAR');
      expect(events.find((event) => event.error)).toBeDefined();
    });

    it('persists the partial answer when the stream breaks mid-way (P.2)', async () => {
      vi.mocked(getProvider).mockReturnValueOnce({
        chat: vi.fn(() =>
          Promise.resolve({
            content: 'Hello!',
            model: 'gpt-4o',
            provider: 'openai',
            tokensUsed: 10,
            latencyMs: 100,
          })
        ),
        streamChat: vi.fn(async function* () {
          yield { token: 'Partial answer', model: 'gpt-4o', provider: 'openai', isFinished: false };
          throw new Error('Provider API failure');
        }),
      } as never);

      const res = await request(app)
        .post('/chat/stream')
        .set(authHeader)
        .set('Content-Type', 'application/json')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            cb(null, data);
          });
        });

      expect(res.status).toBe(200);
      // The assistant placeholder is created empty, then updated with whatever
      // was generated before the break — never left blank.
      const flushedPartial = mockPrisma.message.update.mock.calls.some(
        (call) => call[0]?.data?.content === 'Partial answer'
      );
      expect(flushedPartial).toBe(true);
    });
  });

  describe('Stream resume (P.1)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    it('GET /chat/stream/:id/live reports inactive when nothing is generating', async () => {
      const res = await request(app)
        .get('/chat/stream/conv-not-running/live')
        .set(authHeader)
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            cb(null, data);
          });
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.body as string);
      expect(events.find((e) => e.type === 'stream.inactive')).toBeDefined();
    });

    it('POST /chat/stream/:id/stop returns 404 when no stream is active', async () => {
      const res = await request(app).post('/chat/stream/conv-not-running/stop').set(authHeader);
      expect(res.status).toBe(404);
    });

    it('GET /chat/stream/:id/live requires authentication', async () => {
      const res = await request(app)
        .get('/chat/stream/conv-x/live')
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            cb(null, data);
          });
        });
      expect(res.status).toBe(401);
    });
  });

  describe('JSON backward compatibility', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Hello',
        modelUsed: 'gpt-4o',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    });

    it('POST /chat with JSON works unchanged', async () => {
      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello!');
    });

    it('POST /chat records exactly one single-mode UsageEvent from provider metadata', async () => {
      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Track this turn' }] });

      expect(res.status).toBe(200);
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user',
          providerId: 'openai',
          modelId: 'gpt-4o',
          inputTokens: 4,
          outputTokens: 6,
          latencyMs: 100,
          mode: 'single',
        },
      });
    });

    it('POST /chat still succeeds when UsageEvent persistence fails', async () => {
      mockPrisma.usageEvent.create.mockRejectedValueOnce(new Error('metrics unavailable'));

      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Do not couple delivery to metrics' }] });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello!');
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.message.create).toHaveBeenCalled();
    });

    it('POST /chat/stream with JSON works unchanged', async () => {
      const res = await request(app)
        .post('/chat/stream')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Hello' }] })
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            cb(null, data);
          });
        });

      expect(res.status).toBe(200);
      expect(res.body).toContain('data: ');
    });

    it('POST /chat/stream records exactly one single-mode UsageEvent on completion', async () => {
      const res = await request(app)
        .post('/chat/stream')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Track this stream' }] })
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on('end', () => cb(null, data));
        });

      expect(res.status).toBe(200);
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user',
          providerId: 'openai',
          modelId: 'gpt-4o',
          inputTokens: 4,
          outputTokens: 6,
          latencyMs: expect.any(Number),
          mode: 'single',
        },
      });
    });

    it('JSON with pre-encoded base64 attachments still works', async () => {
      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [
            {
              role: 'user',
              content: 'Describe this',
              attachments: [
                {
                  type: 'image',
                  base64: 'data:image/png;base64,iVBORw0KGgo=',
                  mimeType: 'image/png',
                  name: 'legacy.png',
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello!');
    });

    it('JSON request without files uses application/json path', async () => {
      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Test' }] });

      // Should succeed — JSON path doesn't trigger multer parsing
      expect(res.status).toBe(200);
    });
  });

  describe('Edge cases', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
      });
    });

    it('returns 400 when preferences JSON is invalid in multipart', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Hi' }]))
        .field('preferences', '{invalid}')
        .attach('files', Buffer.from('fake-data'), 'test.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid JSON in 'preferences'");
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/chat')
        .field('messages', JSON.stringify([{ role: 'user', content: 'Hi' }]));

      expect(res.status).toBe(401);
    });

    it('handles multipart with zero files gracefully', async () => {
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Test',
        modelUsed: 'gpt-4o',
      });

      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Test' }]))
        // No .attach() call — only text fields
        .set('Content-Type', 'multipart/form-data');

      // Should work — messages field is parsed, no files attached
      expect(res.status).toBe(200);
    });
  });

  describe('Incognito mode', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
      });
      mockPrisma.providerConfig.findMany.mockResolvedValue([
        {
          id: 'config-1',
          providerId: 'openai',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key',
          isActive: true,
        },
        {
          id: 'config-2',
          providerId: 'deepseek',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key-2',
          isActive: true,
        },
      ]);
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-should-not-exist',
        userId: 'test-user',
        title: 'Should not persist',
        modelUsed: 'gpt-4o',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-should-not-exist' });
      mockPrisma.councilTurn.create.mockResolvedValue({ id: 'turn-should-not-exist' });
    });

    it('rejects a non-boolean incognito flag in JSON preferences', async () => {
      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Private question' }],
          preferences: { incognito: 'true' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('incognito');
      expect(mockPrisma.usageEvent.create).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean incognito flag in multipart preferences', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Private upload' }]))
        .field('preferences', JSON.stringify({ incognito: 1 }))
        .attach('files', Buffer.from('fake-png-data'), 'private.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('incognito');
      expect(mockPrisma.usageEvent.create).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('answers a JSON single chat and records usage without any conversation or message writes', async () => {
      const res = await request(app)
        .post('/chat')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Do not remember this' }],
          conversationId: 'existing-persisted-conversation',
          preferences: { incognito: true },
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        content: 'Hello!',
        provider: 'openai',
        incognito: true,
      });
      expect(res.body.conversationId).toBeUndefined();
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a non-boolean incognito flag for Council before any execution or persistence', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Invalid private council question' }],
          preferences: { incognito: 'yes' },
        });

      expect(res.status).toBe(200);
      const events = parseSSE(res.text);
      expect(events.find((event) => event.type === 'turn.error')?.message).toContain('incognito');
      expect(mockPrisma.providerConfig.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.councilTurn.create).not.toHaveBeenCalled();
    });

    it('answers a multipart single chat and records usage without persistence', async () => {
      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Private image' }]))
        .field('preferences', JSON.stringify({ incognito: true }))
        .field('conversationId', 'existing-persisted-conversation')
        .attach('files', Buffer.from('fake-png-data'), 'private.png');

      expect(res.status).toBe(200);
      expect(res.body.incognito).toBe(true);
      expect(res.body.conversationId).toBeUndefined();
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(1);
    });

    it('streams single chat through an ephemeral StreamHub id without persistence or title generation', async () => {
      const res = await request(app)
        .post('/chat/stream')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Ephemeral stream' }],
          conversationId: 'existing-persisted-conversation',
          preferences: { incognito: true },
        })
        .buffer(true)
        .parse((response, cb) => {
          let data = '';
          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          response.on('end', () => cb(null, data));
        });

      expect(res.status).toBe(200);
      const events = parseSSE(res.body as string);
      const streamEvent = events.find((event) => event.type === 'stream.created');
      expect(streamEvent).toMatchObject({ incognito: true });
      expect(String(streamEvent?.streamId)).toMatch(/^incognito-/);
      expect(events.some((event) => event.type === 'conversation.created')).toBe(false);
      expect(events.some((event) => event.type === 'title.updated')).toBe(false);
      expect(events.at(-1)).toMatchObject({ incognito: true, isFinished: true });
      expect(events.at(-1)?.conversationId).toBeUndefined();
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(1);

      const replay = await request(app)
        .get(`/chat/stream/${String(streamEvent?.streamId)}/live`)
        .set(authHeader)
        .buffer(true)
        .parse((response, cb) => {
          let data = '';
          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          response.on('end', () => cb(null, data));
        });
      const replayEvents = parseSSE(replay.body as string);
      expect(replay.status).toBe(200);
      expect(replayEvents.find((event) => event.type === 'stream.created')).toMatchObject({
        streamId: streamEvent?.streamId,
        incognito: true,
      });
      expect(replayEvents.some((event) => event.type === 'conversation.created')).toBe(false);
    });

    it('runs Council SSE and real usage accounting without Conversation, Message, CouncilTurn, or CouncilVoice writes', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Private council question' }],
          conversationId: 'existing-persisted-conversation',
          preferences: { incognito: true },
        });

      expect(res.status).toBe(200);
      const events = parseSSE(res.text);
      expect(events.some((event) => event.type === 'council.start')).toBe(true);
      expect(events.some((event) => event.type === 'council.answer.done')).toBe(true);
      const streamEvent = events.find((event) => event.type === 'stream.created');
      expect(streamEvent).toMatchObject({ incognito: true });
      expect(String(streamEvent?.streamId)).toMatch(/^incognito-/);
      expect(events.some((event) => event.type === 'conversation.created')).toBe(false);
      expect(events.some((event) => event.type === 'title.updated')).toBe(false);
      expect(events.at(-1)).toMatchObject({ incognito: true, isFinished: true });
      expect(events.at(-1)?.conversationId).toBeUndefined();
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
      expect(mockPrisma.councilTurn.create).not.toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(8);
    });
  });

  describe('POST /chat/multi (multipart)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([
        {
          id: 'config-1',
          providerId: 'openai',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key',
          isActive: true,
        },
        {
          id: 'config-2',
          providerId: 'deepseek',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key-2',
          isActive: true,
        },
      ]);
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Test',
        modelUsed: 'council',
      });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
      mockPrisma.councilTurn.create.mockResolvedValue({ id: 'turn-1' });
      mockPrisma.activeModelsConfig.findMany.mockResolvedValue([]);
    });

    it('accepts multipart form-data on /chat/multi with file (Council mode)', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set(authHeader)
        .field('messages', JSON.stringify([{ role: 'user', content: 'Analyze this image' }]))
        .attach('files', Buffer.from('fake-png-data'), 'photo.png');

      // Council is always SSE; parse the event stream for council events
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.text);
      const startEvent = events.find((e) => e.type === 'council.start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.members).toBeDefined();
    });

    it('accepts JSON on /chat/multi (Council mode)', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Test' }] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.text);
      const startEvent = events.find((e) => e.type === 'council.start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.members).toBeDefined();
    });

    it('uses manual config when valid (Council mode)', async () => {
      mockPrisma.councilConfig.findUnique.mockResolvedValue({
        id: 'cc-1',
        userId: 'test-user',
        modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat'],
        mode: 'manual',
      });

      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Test with manual config' }] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.text);
      const startEvent = events.find((e) => e.type === 'council.start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.members).toBeDefined();
    });

    it('falls back to auto-selection when manual config is invalid', async () => {
      // Config references a disconnected provider — should fall back
      mockPrisma.councilConfig.findUnique.mockResolvedValue({
        id: 'cc-1',
        userId: 'test-user',
        modelIds: ['openai:gpt-4o', 'anthropic:claude-3-sonnet'],
        mode: 'manual',
      });

      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Test fallback' }] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.text);
      const startEvent = events.find((e) => e.type === 'council.start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.members).toBeDefined();
    });

    it('respects active-models allow-list when auto-selecting council members', async () => {
      // Three capable models are available, but the allow-list keeps only two.
      // gpt-4o should be filtered out.
      mockPrisma.providerConfig.findMany.mockResolvedValue([
        {
          id: 'config-1',
          providerId: 'openai',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key',
          isActive: true,
        },
        {
          id: 'config-2',
          providerId: 'deepseek',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key-2',
          isActive: true,
        },
        {
          id: 'config-3',
          providerId: 'anthropic',
          userId: 'test-user',
          encryptedApiKey: 'enc:test-api-key-3',
          isActive: true,
        },
      ]);
      const { findCapableModels } = await import('@chat/router');
      vi.mocked(findCapableModels).mockReturnValueOnce([
        {
          provider: 'openai',
          modelId: 'gpt-4o',
          modalities: ['text'],
          features: ['tool-use', 'reasoning'],
          contextWindow: 128000,
        },
        {
          provider: 'deepseek',
          modelId: 'deepseek-chat',
          modalities: ['text'],
          features: ['tool-use', 'reasoning'],
          contextWindow: 64000,
        },
        {
          provider: 'anthropic',
          modelId: 'claude-3-sonnet',
          modalities: ['text'],
          features: ['tool-use', 'reasoning'],
          contextWindow: 200000,
        },
      ]);
      mockPrisma.activeModelsConfig.findMany.mockResolvedValue([
        { providerId: 'openai', modelIds: ['gpt-4o-mini'] },
        { providerId: 'deepseek', modelIds: ['deepseek-chat'] },
        { providerId: 'anthropic', modelIds: ['claude-3-sonnet'] },
      ]);

      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Active models only' }] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.text);
      const startEvent = events.find((e) => e.type === 'council.start');
      expect(startEvent).toBeDefined();
      const modelIds = startEvent?.members.map((m: { modelId: string }) => m.modelId);
      expect(modelIds).toContain('deepseek-chat');
      expect(modelIds).toContain('claude-3-sonnet');
      expect(modelIds).not.toContain('gpt-4o');
    });

    it("returns SSE error when user tries to council-chat to another user's conversation", async () => {
      // user-2 tries to write to a conversation owned by test-user
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const otherAuthHeader = { Authorization: `Bearer ${TEST_TOKEN_2}` };
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...otherAuthHeader, 'Content-Type': 'application/json' })
        .send({
          messages: [{ role: 'user', content: 'Test' }],
          conversationId: 'conv-owned-by-test-user',
        });

      // SSE contract: always 200, error carried inside the stream
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      const events = parseSSE(res.text);
      const errorEvent = events.find((e) => e.type === 'turn.error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.message).toBe('Conversation not found');
    });

    it('persists aggregated input/output tokens on the council assistant message', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Question for the council' }] });

      expect(res.status).toBe(200);

      // The assistant message is the message.create call tagged providerId "council".
      const assistantCall = mockPrisma.message.create.mock.calls.find(
        (call) => call[0]?.data?.providerId === 'council'
      );
      expect(assistantCall).toBeDefined();
      const data = assistantCall![0].data;
      // Every member burns tokens across proposals/debate/vote/synthesis, so the
      // aggregate must be strictly positive — not the zero it used to persist.
      expect(data.inputTokens).toBeGreaterThan(0);
      expect(data.outputTokens).toBeGreaterThan(0);
    });

    it('council tokensUsed equals the sum of aggregated input and output', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Another council question' }] });

      expect(res.status).toBe(200);

      const assistantCall = mockPrisma.message.create.mock.calls.find(
        (call) => call[0]?.data?.providerId === 'council'
      );
      expect(assistantCall).toBeDefined();
      const data = assistantCall![0].data;
      expect(data.tokensUsed).toBe((data.inputTokens ?? 0) + (data.outputTokens ?? 0));
    });

    it('records one council UsageEvent per real provider call without attributing usage to a fake council provider', async () => {
      const res = await request(app)
        .post('/chat/multi')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'Measure council usage' }] });

      expect(res.status).toBe(200);
      expect(mockPrisma.usageEvent.create).toHaveBeenCalledTimes(8);

      const usageRows = mockPrisma.usageEvent.create.mock.calls.map((call) => call[0].data);
      expect(usageRows.every((row) => row.mode === 'council')).toBe(true);
      expect(usageRows.every((row) => row.providerId === 'openai')).toBe(true);
      expect(usageRows.every((row) => row.providerId !== 'council')).toBe(true);
      expect(usageRows.every((row) => row.modelId === 'gpt-4o')).toBe(true);

      const assistantCall = mockPrisma.message.create.mock.calls.find(
        (call) => call[0]?.data?.providerId === 'council'
      );
      expect(assistantCall).toBeDefined();
      const assistantData = assistantCall![0].data;
      expect(usageRows.reduce((sum, row) => sum + row.inputTokens, 0)).toBe(
        assistantData.inputTokens
      );
      expect(usageRows.reduce((sum, row) => sum + row.outputTokens, 0)).toBe(
        assistantData.outputTokens
      );
    });
  });

  // ─── Provider fallback selection ────────────────────────────────────────
  describe('POST /chat — fallback selection', () => {
    const authHeader = {
      Authorization: `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json',
    };

    it('falls back to a configured provider when the primary is not configured', async () => {
      // Primary (openai) has no key; fallback (anthropic) does.
      vi.mocked(route).mockReturnValueOnce({
        primary: { provider: 'openai', modelId: 'gpt-4o' } as never,
        fallbacks: [{ provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' } as never],
      });
      mockPrisma.providerConfig.findUnique.mockImplementation(
        (args: { where: { userId_providerId: { providerId: string } } }) =>
          Promise.resolve(
            args.where.userId_providerId.providerId === 'anthropic'
              ? {
                  id: 'c2',
                  providerId: 'anthropic',
                  userId: 'test-user',
                  encryptedApiKey: 'enc:test-api-key',
                }
              : null
          )
      );
      mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .send({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(res.status).toBe(200);
    });

    it('returns 400 when neither primary nor fallbacks are configured', async () => {
      vi.mocked(route).mockReturnValueOnce({
        primary: { provider: 'openai', modelId: 'gpt-4o' } as never,
        fallbacks: [{ provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' } as never],
      });
      mockPrisma.providerConfig.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .send({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('openai, anthropic');
    });

    it('returns 422 with a clear error when Auto can only pick completion-only models (Post-deploy #1)', async () => {
      // The router's defense-in-depth message — the API endpoint must map it
      // to a 422 with a user-facing explanation, not a 500 with the raw
      // string from the upstream provider.
      vi.mocked(route).mockImplementationOnce(() => {
        throw new Error('No capable chat models available for this request');
      });

      const res = await request(app)
        .post('/chat')
        .set(authHeader)
        .send({ messages: [{ role: 'user', content: 'hola' }] });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/chat/i);
      expect(res.body.error).not.toContain('v1/completions');
    });

    it('returns 422 in the same way on POST /chat/stream (Post-deploy #1)', async () => {
      // The router rejects Auto before SSE headers are even set on the
      // stream endpoint (the throw happens in the route setup, before
      // res.setHeader). The client gets a 422 with the same friendly
      // message the non-stream endpoint returns — it can show it before
      // it tries to read an event stream.
      vi.mocked(route).mockImplementationOnce(() => {
        throw new Error('No capable chat models available for this request');
      });

      const res = await request(app)
        .post('/chat/stream')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ messages: [{ role: 'user', content: 'hola' }] });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/chat/i);
    });
  });

  // ─── Google sign-in ─────────────────────────────────────────────────────
  describe('POST /auth/google', () => {
    const payload = {
      sub: 'g-12345',
      email: 'google@test.local',
      email_verified: true,
      name: 'Google User',
    };

    beforeEach(() => {
      gm.verifyIdToken.mockReset();
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.user.create.mockReset();
      mockPrisma.user.update.mockReset();
    });

    it('creates a new user from a valid Google credential', async () => {
      gm.verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'g-user-1',
        email: payload.email,
        name: payload.name,
      });

      const res = await request(app).post('/auth/google').send({ credential: 'fake-google-token' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('google@test.local');
      expect(res.body.user.name).toBe('Google User');
    });

    it('links Google to an existing email-password account', async () => {
      gm.verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'existing',
        email: payload.email,
        googleId: null,
        name: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'existing',
        email: payload.email,
        name: payload.name,
      });

      const res = await request(app).post('/auth/google').send({ credential: 'fake-google-token' });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('existing');
    });

    it('returns 401 for invalid token', async () => {
      gm.verifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
      const res = await request(app).post('/auth/google').send({ credential: 'bad-token' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when email is not verified', async () => {
      gm.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({ ...payload, email_verified: false }),
      });
      const res = await request(app).post('/auth/google').send({ credential: 'fake-google-token' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when credential field is missing', async () => {
      const res = await request(app).post('/auth/google').send({});
      expect(res.status).toBe(400);
    });
  });

  // ─── GitHub sign-in (Authorization Code flow) ───────────────────────────
  describe('GET /auth/github', () => {
    const ORIGINAL_GH_ID = process.env.GITHUB_CLIENT_ID;
    const ORIGINAL_GH_SECRET = process.env.GITHUB_CLIENT_SECRET;

    beforeEach(() => {
      process.env.GITHUB_CLIENT_ID = 'test-gh-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-gh-client-secret';
    });

    afterEach(() => {
      if (ORIGINAL_GH_ID === undefined) delete process.env.GITHUB_CLIENT_ID;
      else process.env.GITHUB_CLIENT_ID = ORIGINAL_GH_ID;
      if (ORIGINAL_GH_SECRET === undefined) delete process.env.GITHUB_CLIENT_SECRET;
      else process.env.GITHUB_CLIENT_SECRET = ORIGINAL_GH_SECRET;
    });

    it('returns 503 when GITHUB_CLIENT_ID is unset', async () => {
      delete process.env.GITHUB_CLIENT_ID;
      const res = await request(app).get('/auth/github');
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not configured/);
    });

    it('302 redirects to github.com with state cookie set', async () => {
      const res = await request(app).get('/auth/github');

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const stateCookie = cookies.find((c: string) => c.startsWith('github_oauth_state='));
      expect(stateCookie).toBeDefined();
      expect(stateCookie).toMatch(/HttpOnly/);
      expect(stateCookie).toMatch(/Path=\/auth/);

      // When the API is served behind a /api proxy prefix, the state cookie must
      // follow REFRESH_COOKIE_PATH so the browser sends it on /api/auth/github/callback.
      const originalPath = process.env.REFRESH_COOKIE_PATH;
      process.env.REFRESH_COOKIE_PATH = '/api/auth';
      const proxiedRes = await request(app).get('/auth/github');
      const proxiedCookies = Array.isArray(proxiedRes.headers['set-cookie'])
        ? proxiedRes.headers['set-cookie']
        : [proxiedRes.headers['set-cookie']];
      const proxiedStateCookie = proxiedCookies.find((c: string) =>
        c.startsWith('github_oauth_state=')
      );
      expect(proxiedStateCookie).toMatch(/Path=\/api\/auth/);
      if (originalPath === undefined) delete process.env.REFRESH_COOKIE_PATH;
      else process.env.REFRESH_COOKIE_PATH = originalPath;
      // Pull the state value out and verify it matches the redirect URL.
      const stateValue = stateCookie!.split(';')[0].split('=')[1];
      expect(res.headers.location).toContain(`state=${stateValue}`);
      // The redirect URL must carry the configured client_id and the /user:email scope.
      expect(res.headers.location).toContain('client_id=test-gh-client-id');
      expect(res.headers.location).toContain('scope=user%3Aemail');
    });
  });

  describe('GET /auth/github/callback', () => {
    const ORIGINAL_GH_ID = process.env.GITHUB_CLIENT_ID;
    const ORIGINAL_GH_SECRET = process.env.GITHUB_CLIENT_SECRET;

    beforeEach(() => {
      process.env.GITHUB_CLIENT_ID = 'test-gh-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-gh-client-secret';
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.user.create.mockReset();
      mockPrisma.user.update.mockReset();
      vi.restoreAllMocks();
    });

    afterEach(() => {
      if (ORIGINAL_GH_ID === undefined) delete process.env.GITHUB_CLIENT_ID;
      else process.env.GITHUB_CLIENT_ID = ORIGINAL_GH_ID;
      if (ORIGINAL_GH_SECRET === undefined) delete process.env.GITHUB_CLIENT_SECRET;
      else process.env.GITHUB_CLIENT_SECRET = ORIGINAL_GH_SECRET;
    });

    function setupGitHubFetchMock(opts: {
      token?: { ok: boolean; access_token?: string; error?: string };
      user: { id: number; login: string; name: string | null; email: string | null };
    }): void {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(
            JSON.stringify(
              opts.token?.ok
                ? {
                    access_token: opts.token.access_token,
                    token_type: 'bearer',
                    scope: 'user:email',
                  }
                : { error: opts.token?.error ?? 'bad_code' }
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://github.com/user') {
          return new Response(JSON.stringify(opts.user), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
    }

    it('returns 400 when code is missing', async () => {
      const res = await request(app).get('/auth/github/callback?state=abc');
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('oauth-error');
    });

    it('returns 401 when state cookie is missing', async () => {
      const res = await request(app).get('/auth/github/callback?code=foo&state=abc');
      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid OAuth state');
    });

    it('returns 401 when state cookie does not match query state', async () => {
      const res = await request(app)
        .get('/auth/github/callback?code=foo&state=other')
        .set('Cookie', 'github_oauth_state=expected');
      expect(res.status).toBe(401);
      expect(res.text).toContain('Invalid OAuth state');
    });

    it('creates a new user via githubId and returns a JWT in the HTML', async () => {
      setupGitHubFetchMock({
        token: { ok: true, access_token: 'gho_test' },
        user: { id: 99999, login: 'octocat', name: 'Octo Cat', email: '[email protected]' },
      });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // by githubId
        .mockResolvedValueOnce(null); // by email
      mockPrisma.user.create.mockResolvedValue({
        id: 'gh-user-1',
        email: '[email protected]',
        name: 'Octo Cat',
      });

      const res = await request(app)
        .get('/auth/github/callback?code=valid-code&state=mystate')
        .set('Cookie', 'github_oauth_state=mystate');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('oauth-success');
      // The postMessage payload must include the JWT (signToken returns
      // `xxx.yyy.zzz` with the JWT in the middle segment). The frontend
      // reads it via `event.data.token` and stores it.
      expect(res.text).toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      // Refresh cookie issued.
      const cookies = res.headers['set-cookie'];
      const cookiesArr = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookiesArr.find((c: string) => c.startsWith('refreshToken='))).toBeDefined();
      // State cookie cleared.
      expect(cookiesArr.find((c: string) => c.startsWith('github_oauth_state=;'))).toBeDefined();
    });

    it('links GitHub to an existing email-password account', async () => {
      setupGitHubFetchMock({
        token: { ok: true, access_token: 'gho_test' },
        user: { id: 99999, login: 'octocat', name: 'Octo Cat', email: '[email protected]' },
      });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // by githubId
        .mockResolvedValueOnce({
          id: 'existing',
          email: '[email protected]',
          passwordHash: 'x',
          googleId: null,
          githubId: null,
          name: null,
        });
      mockPrisma.user.update.mockResolvedValue({
        id: 'existing',
        email: '[email protected]',
        name: 'Octo Cat',
      });

      const res = await request(app)
        .get('/auth/github/callback?code=valid-code&state=mystate')
        .set('Cookie', 'github_oauth_state=mystate');

      expect(res.status).toBe(200);
      expect(res.text).toContain('oauth-success');
    });

    it('returns 401 when GitHub user has no email and no verified primary in /emails', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(JSON.stringify({ access_token: 'gho_test', token_type: 'bearer' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://github.com/user') {
          return new Response(
            JSON.stringify({ id: 1, login: 'private', name: null, email: null }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        if (url === 'https://api.github.com/user/emails') {
          return new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app)
        .get('/auth/github/callback?code=valid-code&state=mystate')
        .set('Cookie', 'github_oauth_state=mystate');

      expect(res.status).toBe(401);
      expect(res.text).toContain('email not verified');
    });
  });

  describe('POST /providers — options validation', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      // Provider ID validation passes when cache is null (no models.dev data loaded)
      mockPrisma.providerConfig.upsert.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        maskedKey: 'sk-a...bcde',
        isActive: true,
        options: null,
      });
    });

    it('accepts valid provider with no options', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({ providerId: 'openai', apiKey: 'sk-test123456789' });
      expect(res.status).toBe(201);
    });

    it('accepts valid public HTTPS baseURL', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'https://api.openai.com/v1' }),
        });
      expect(res.status).toBe(201);
    });

    it('accepts localhost for local LLMs', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'http://localhost:11434/v1' }),
        });
      expect(res.status).toBe(201);
    });

    it('accepts valid allowlisted headers', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({
            baseURL: 'https://api.openai.com/v1',
            headers: { 'HTTP-Referer': 'https://myapp.com', 'X-Title': 'MyApp' },
          }),
        });
      expect(res.status).toBe(201);
    });

    it('accepts valid apiEndpoint path', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({
            baseURL: 'https://api.openai.com/v1',
            apiEndpoint: '/v1/chat/completions',
          }),
        });
      expect(res.status).toBe(201);
    });

    it('rejects http:// non-localhost URL (SSRF protection)', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'http://evil.com' }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects private IP baseURL (SSRF protection)', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'https://10.0.0.1/api' }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects AWS metadata endpoint (SSRF protection)', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'http://169.254.169.254/latest/meta-data/' }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects GCP metadata hostname', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'https://metadata.google.internal' }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects 127.0.0.1 (non-localhost loopback SSRF)', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({ baseURL: 'https://127.0.0.1:8080' }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects non-allowlisted custom header', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({
            baseURL: 'https://api.openai.com/v1',
            headers: { 'X-Evil-Header': 'injected' },
          }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects Host header injection', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({
            baseURL: 'https://api.openai.com/v1',
            headers: { Host: 'evil.com' },
          }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects apiEndpoint with path traversal', async () => {
      const res = await request(app)
        .post('/providers')
        .set(authHeader)
        .send({
          providerId: 'openai',
          apiKey: 'sk-test123456789',
          options: JSON.stringify({
            baseURL: 'https://api.openai.com/v1',
            apiEndpoint: '/../admin/secret',
          }),
        });
      expect(res.status).toBe(400);
    });

    it('rejects invalid options JSON', async () => {
      const res = await request(app).post('/providers').set(authHeader).send({
        providerId: 'openai',
        apiKey: 'sk-test123456789',
        options: 'not-json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /providers/test-connection', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
        isActive: true,
        options: null,
      });
    });

    it('returns success when provider responds', async () => {
      const res = await request(app)
        .post('/providers/test-connection')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ providerId: 'openai' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when providerId is missing', async () => {
      const res = await request(app)
        .post('/providers/test-connection')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('providerId required');
    });

    it('returns 400 when provider is not configured and no apiKey given', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/providers/test-connection')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ providerId: 'openai' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not configured');
    });

    it('returns 502 when provider call fails', async () => {
      vi.mocked(getProvider).mockReturnValueOnce({
        chat: vi.fn(() => Promise.reject(new Error('API key invalid'))),
        getCapabilities: vi.fn(() => [{ modelId: 'gpt-4o' }]),
      } as never);

      const res = await request(app)
        .post('/providers/test-connection')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ providerId: 'openai' });

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('API key invalid');
    });
  });

  describe('GET /providers/health', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      // The cache is a process-wide singleton — clear it so each test probes fresh.
      providerHealthCache.clear();
      // Connected providers lookup for the route.
      mockPrisma.providerConfig.findMany.mockResolvedValue([{ providerId: 'openai' }]);
      // Config lookup performed by the health checker for each provider.
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
        isActive: true,
        options: null,
      });
    });

    it('returns ok:true for a reachable connected provider', async () => {
      const res = await request(app).get('/providers/health').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.health.openai.ok).toBe(true);
      expect(typeof res.body.health.openai.checkedAt).toBe('number');
    });

    it('returns ok:false with the error when a provider probe fails', async () => {
      vi.mocked(getProvider).mockReturnValueOnce({
        chat: vi.fn(() => Promise.reject(new Error('API key invalid'))),
        getCapabilities: vi.fn(() => [{ modelId: 'gpt-4o' }]),
      } as never);

      const res = await request(app).get('/providers/health').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.health.openai.ok).toBe(false);
      expect(res.body.health.openai.error).toBe('API key invalid');
    });

    it('returns an empty map when the user has no connected providers', async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);

      const res = await request(app).get('/providers/health').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.health).toEqual({});
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/providers/health');
      expect(res.status).toBe(401);
    });
  });

  // ─── Council config CRUD ────────────────────────────────────────────────
  describe('Council config endpoints', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    beforeEach(() => {
      mockPrisma.councilConfig.findUnique.mockReset();
      mockPrisma.councilConfig.upsert.mockReset();
      mockPrisma.councilConfig.deleteMany.mockReset();
    });

    it('GET /council/config returns 204 when no config exists', async () => {
      mockPrisma.councilConfig.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/council/config').set(authHeader);

      expect(res.status).toBe(204);
    });

    it('GET /council/config returns config when it exists', async () => {
      mockPrisma.councilConfig.findUnique.mockResolvedValue({
        id: 'cc-1',
        userId: 'test-user',
        modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat'],
        mode: 'manual',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });

      const res = await request(app).get('/council/config').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('manual');
      expect(res.body.modelIds).toEqual(['openai:gpt-4o', 'deepseek:deepseek-chat']);
    });

    it('PUT /council/config creates config when none exists', async () => {
      mockPrisma.councilConfig.upsert.mockResolvedValue({
        id: 'cc-1',
        userId: 'test-user',
        modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat'],
        mode: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .put('/council/config')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat'], mode: 'manual' });

      expect(res.status).toBe(200);
      expect(res.body.modelIds).toEqual(['openai:gpt-4o', 'deepseek:deepseek-chat']);
      expect(res.body.mode).toBe('manual');
    });

    it('PUT /council/config returns 400 for invalid body', async () => {
      const res = await request(app)
        .put('/council/config')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ modelIds: ['openai:gpt-4o'], mode: 'manual' });

      expect(res.status).toBe(400);
    });

    it('PUT /council/config returns 400 for malformed modelIds', async () => {
      const res = await request(app)
        .put('/council/config')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ modelIds: ['bad-format'], mode: 'manual' });

      expect(res.status).toBe(400);
    });

    it('PUT /council/config returns 400 when fewer than 2 modelIds', async () => {
      const res = await request(app)
        .put('/council/config')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({ modelIds: ['openai:gpt-4o'], mode: 'manual' });

      expect(res.status).toBe(400);
    });

    it('PUT /council/config returns 400 when more than 8 modelIds', async () => {
      const res = await request(app)
        .put('/council/config')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          modelIds: Array.from({ length: 9 }, (_, i) => `openai:model-${i}`),
          mode: 'manual',
        });

      expect(res.status).toBe(400);
    });

    it('PUT /council/config updates existing config', async () => {
      mockPrisma.councilConfig.upsert.mockResolvedValue({
        id: 'cc-1',
        userId: 'test-user',
        modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat', 'anthropic:claude-3-sonnet'],
        mode: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .put('/council/config')
        .set({ ...authHeader, 'Content-Type': 'application/json' })
        .send({
          modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat', 'anthropic:claude-3-sonnet'],
          mode: 'manual',
        });

      expect(res.status).toBe(200);
      expect(res.body.modelIds).toEqual([
        'openai:gpt-4o',
        'deepseek:deepseek-chat',
        'anthropic:claude-3-sonnet',
      ]);
      expect(res.body.mode).toBe('manual');
    });

    it('DELETE /council/config returns 204', async () => {
      mockPrisma.councilConfig.deleteMany.mockResolvedValue({ count: 1 });

      const res = await request(app).delete('/council/config').set(authHeader);

      expect(res.status).toBe(204);
    });

    it('council config endpoints require auth', async () => {
      const getRes = await request(app).get('/council/config');
      expect(getRes.status).toBe(401);

      const putRes = await request(app)
        .put('/council/config')
        .send({ modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat'], mode: 'manual' });
      expect(putRes.status).toBe(401);

      const delRes = await request(app).delete('/council/config');
      expect(delRes.status).toBe(401);
    });
  });

  describe('DELETE /conversations/:id (soft delete)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    it('soft-deletes a conversation the user owns', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        deletedAt: null,
      });
      mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1', deletedAt: new Date() });

      const res = await request(app).delete('/conversations/conv-1').set(authHeader);

      expect(res.status).toBe(204);
      // Ownership + not-already-deleted is enforced in the query.
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', userId: 'test-user', deletedAt: null },
      });
      // Soft delete = stamp deletedAt, never a physical delete.
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("returns 404 (not 403) when deleting another user's conversation", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null); // userId mismatch → not found

      const res = await request(app)
        .delete('/conversations/conv-1')
        .set({ Authorization: `Bearer ${TEST_TOKEN_2}` });

      expect(res.status).toBe(404);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    it('excludes soft-deleted conversations from the list', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const res = await request(app).get('/conversations').set(authHeader);

      expect(res.status).toBe(200);
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'test-user', deletedAt: null } })
      );
    });
  });

  describe('PATCH /conversations/:id (rename)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    it('renames a conversation the user owns', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Old title',
        deletedAt: null,
      });
      mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1', title: 'New title' });

      const res = await request(app)
        .patch('/conversations/conv-1')
        .set(authHeader)
        .send({ title: 'New title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('New title');
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', userId: 'test-user', deletedAt: null },
      });
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { title: 'New title' },
      });
    });

    it("returns 404 when renaming another user's conversation", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .patch('/conversations/conv-1')
        .set({ Authorization: `Bearer ${TEST_TOKEN_2}` })
        .send({ title: 'Hijack' });

      expect(res.status).toBe(404);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    it('rejects an empty title with 400', async () => {
      const res = await request(app)
        .patch('/conversations/conv-1')
        .set(authHeader)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('POST /conversations/:id/retitle (P.3)', () => {
    const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

    it('regenerates the title for a conversation the user owns', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Hola',
        deletedAt: null,
        messages: [
          { role: 'user', content: '¿Cuál es la capital de Francia?', createdAt: new Date() },
          { role: 'assistant', content: 'La capital de Francia es París.', createdAt: new Date() },
        ],
      });
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        providerId: 'openai',
        userId: 'test-user',
        encryptedApiKey: 'enc:test-api-key',
      });
      mockPrisma.conversation.update.mockResolvedValue({
        id: 'conv-1',
        title: 'Capital de Francia',
      });

      const res = await request(app).post('/conversations/conv-1/retitle').set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Capital de Francia');
      // The generated (non-empty) title is what gets persisted.
      const updateCall = mockPrisma.conversation.update.mock.calls.at(-1);
      expect(updateCall?.[0].data.title).toBeTruthy();
    });

    it("returns 404 when retitling another user's conversation", async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/conversations/conv-1/retitle')
        .set({ Authorization: `Bearer ${TEST_TOKEN_2}` });

      expect(res.status).toBe(404);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    it('returns 400 when the conversation has no assistant exchange yet', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        userId: 'test-user',
        title: 'Hola',
        deletedAt: null,
        messages: [{ role: 'user', content: 'Solo un saludo', createdAt: new Date() }],
      });

      const res = await request(app).post('/conversations/conv-1/retitle').set(authHeader);

      expect(res.status).toBe(400);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('Refresh token flow (httpOnly cookie)', () => {
    it('login sets an httpOnly refresh cookie and persists its hash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        passwordHash: 'hashed-password',
      });

      const res = await request(app).post('/auth/login').send({
        email: 'login@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie']?.[0] ?? '';
      expect(setCookie).toContain('refreshToken=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Path=/auth');
      // Hash persisted, raw never stored.
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', tokenHash: expect.any(String) }),
        })
      );
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenHash: 'refreshtoken-raw' }),
        })
      );
    });

    it('POST /auth/refresh with a valid cookie returns a new access token and rotates', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'u@example.com',
        name: 'U',
      });

      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'refreshToken=some-raw-token');

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      // Rotation: old token revoked + a brand-new one issued.
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date), lastSeenAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      const setCookie = res.headers['set-cookie']?.[0] ?? '';
      expect(setCookie).toContain('refreshToken=');
    });

    it('POST /auth/refresh without a cookie returns 401', async () => {
      const res = await request(app).post('/auth/refresh');
      expect(res.status).toBe(401);
      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('POST /auth/refresh with a revoked token returns 401 and does not rotate', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-2',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'refreshToken=revoked-token');

      expect(res.status).toBe(401);
      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('POST /auth/logout revokes the token and clears the cookie', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Cookie', 'refreshToken=some-raw-token');

      expect(res.status).toBe(204);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
          data: { revokedAt: expect.any(Date) },
        })
      );
      const setCookie = res.headers['set-cookie']?.[0] ?? '';
      expect(setCookie).toContain('refreshToken=;');
    });
  });
});

describe('GET /usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated usage data for authenticated user', async () => {
    mockPrisma.usageEvent.groupBy.mockResolvedValue([
      {
        providerId: 'openai',
        modelId: 'gpt-4o',
        _sum: { inputTokens: 1000, outputTokens: 2000 },
        _count: { id: 5 },
        _avg: { latencyMs: 250 },
      },
      {
        providerId: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        _sum: { inputTokens: 500, outputTokens: 800 },
        _count: { id: 3 },
        _avg: { latencyMs: 300 },
      },
    ]);

    const res = await request(app).get('/usage').set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe('all');
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0]).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 2000,
      totalTokens: 3000,
      requestCount: 5,
      avgLatencyMs: 250,
    });
    expect(res.body.totals).toMatchObject({
      inputTokens: 1500,
      outputTokens: 2800,
      totalTokens: 4300,
      totalRequests: 8,
    });
    expect(res.body.insights).toBeInstanceOf(Array);
    expect(res.body.insights.length).toBeGreaterThanOrEqual(2);
    expect(mockPrisma.usageEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['providerId', 'modelId'],
        where: expect.objectContaining({
          userId: 'test-user',
        }),
      })
    );
    expect(mockPrisma.message.groupBy).not.toHaveBeenCalled();
  });

  it('returns empty result when user has no usage events', async () => {
    mockPrisma.usageEvent.groupBy.mockResolvedValue([]);

    const res = await request(app).get('/usage').set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([]);
    expect(res.body.totals).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalRequests: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
    });
    expect(res.body.insights).toEqual([]);
  });

  it('filters by period=30d', async () => {
    mockPrisma.usageEvent.groupBy.mockResolvedValue([
      {
        providerId: 'openai',
        modelId: 'gpt-4o',
        _sum: { inputTokens: 100, outputTokens: 200 },
        _count: { id: 1 },
        _avg: { latencyMs: 200 },
      },
    ]);

    const res = await request(app)
      .get('/usage?period=30d')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe('30d');
    expect(mockPrisma.usageEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'test-user',
          createdAt: expect.any(Object),
        }),
      })
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/usage');
    expect(res.status).toBe(401);
  });

  it('GET /usage/heatmap returns daily token totals for the user (period=6m default)', async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { day: new Date(`${todayStr}T00:00:00.000Z`), tokens: BigInt(1234) },
      { day: new Date(`${yesterdayStr}T00:00:00.000Z`), tokens: BigInt(0) },
    ]);

    const res = await request(app)
      .get('/usage/heatmap')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe('6m');
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days).toHaveLength(180);
    expect(res.body.days[res.body.days.length - 1].date).toBe(todayStr);
    expect(res.body.days[res.body.days.length - 1].tokens).toBe(1234);
    expect(res.body.totalTokens).toBe(1234);
    expect(res.body.peakTokens).toBe(1234);
    expect(res.body.activeDays).toBe(1);
  });

  it('GET /usage/heatmap respects period=3m and period=12m', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const res3 = await request(app)
      .get('/usage/heatmap?period=3m')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res3.body.days).toHaveLength(90);

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    const res12 = await request(app)
      .get('/usage/heatmap?period=12m')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res12.body.days).toHaveLength(365);
  });

  it('calculates estimated cost using static pricing', async () => {
    mockPrisma.usageEvent.groupBy.mockResolvedValue([
      {
        providerId: 'openai',
        modelId: 'gpt-4o',
        _sum: { inputTokens: 100000, outputTokens: 200000 },
        _count: { id: 10 },
        _avg: { latencyMs: 300 },
      },
    ]);

    const res = await request(app).get('/usage').set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const row = res.body.rows[0];
    // Cost = (100000 * 0.0000025) + (200000 * 0.00001) = 0.25 + 2.00 = 2.25
    expect(row.estimatedCostUsd).toBeCloseTo(2.25, 2);
    expect(res.body.totals.totalCostUsd).toBeCloseTo(2.25, 2);
  });

  it('scopes usage aggregation directly by userId', async () => {
    mockPrisma.usageEvent.groupBy.mockResolvedValue([
      {
        providerId: 'openai',
        modelId: 'gpt-4o',
        _sum: { inputTokens: 100, outputTokens: 200 },
        _count: { id: 1 },
        _avg: { latencyMs: 200 },
      },
    ]);

    const res = await request(app).get('/usage').set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.usageEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'test-user' },
      })
    );
  });
});

describe('Active models config (#1)', () => {
  const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

  it('GET /providers/active-models returns the saved allow-lists as a map', async () => {
    mockPrisma.activeModelsConfig.findMany.mockResolvedValueOnce([
      { providerId: 'openai', modelIds: ['gpt-5.4', 'gpt-5.4-mini'] },
    ]);
    const res = await request(app).get('/providers/active-models').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.active.openai).toEqual(['gpt-5.4', 'gpt-5.4-mini']);
  });

  it('GET /providers/active-models/:providerId is 404 when the provider is not connected', async () => {
    mockPrisma.providerConfig.findUnique.mockResolvedValueOnce(null);
    const res = await request(app).get('/providers/active-models/openai').set(authHeader);
    expect(res.status).toBe(404);
  });

  it('GET /providers/active-models/:providerId returns the active ids for a connected provider', async () => {
    mockPrisma.providerConfig.findUnique.mockResolvedValueOnce({ isActive: true });
    mockPrisma.activeModelsConfig.findUnique.mockResolvedValueOnce({ modelIds: ['gpt-5.4'] });
    const res = await request(app).get('/providers/active-models/openai').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.activeIds).toEqual(['gpt-5.4']);
    expect(Array.isArray(res.body.models)).toBe(true);
  });

  it('PUT /providers/active-models/:providerId upserts a non-empty allow-list', async () => {
    mockPrisma.activeModelsConfig.upsert.mockResolvedValueOnce({});
    const res = await request(app)
      .put('/providers/active-models/openai')
      .set(authHeader)
      .send({ modelIds: ['gpt-5.4'] });
    expect(res.status).toBe(200);
    expect(res.body.activeIds).toEqual(['gpt-5.4']);
    expect(mockPrisma.activeModelsConfig.upsert).toHaveBeenCalled();
  });

  it("PUT /providers/active-models/:providerId with an empty list resets to 'show all' (deletes the row)", async () => {
    const res = await request(app)
      .put('/providers/active-models/openai')
      .set(authHeader)
      .send({ modelIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.activeIds).toEqual([]);
    expect(mockPrisma.activeModelsConfig.deleteMany).toHaveBeenCalled();
  });

  it('PUT /providers/active-models/:providerId rejects a non-array body with 400', async () => {
    const res = await request(app)
      .put('/providers/active-models/openai')
      .set(authHeader)
      .send({ modelIds: 'gpt-5.4' });
    expect(res.status).toBe(400);
  });
});

// ─── Onboarding: auth endpoints return `created` ────────────────────────────
describe('Onboarding — auth endpoints report created', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
  });

  it('POST /auth/register response includes created: true', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-new',
      email: 'new@example.com',
    });

    const res = await request(app).post('/auth/register').send({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
  });

  it('POST /auth/login response includes created: false', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'existing@example.com',
      passwordHash: 'hashed-password',
    });

    const res = await request(app).post('/auth/login').send({
      email: 'existing@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
  });

  describe('POST /auth/google — created reflects whether the user row was newly inserted', () => {
    const payload = {
      sub: 'g-99999',
      email: 'google-onboarding@test.local',
      email_verified: true,
      name: 'Google User',
    };

    beforeEach(() => {
      gm.verifyIdToken.mockReset();
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.user.create.mockReset();
      mockPrisma.user.update.mockReset();
    });

    it('returns created: true when a brand-new user is created via Google', async () => {
      gm.verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'g-user-new',
        email: payload.email,
        name: payload.name,
      });

      const res = await request(app).post('/auth/google').send({ credential: 'fake-token' });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
    });

    it('returns created: false when an existing Google user signs in', async () => {
      gm.verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });
      // findUnique by googleId returns existing user
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'g-user-existing',
        email: payload.email,
        name: payload.name,
      });

      const res = await request(app).post('/auth/google').send({ credential: 'fake-token' });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
    });
  });

  describe('GET /auth/github/callback — created in postMessage payload', () => {
    const ORIGINAL_GH_ID = process.env.GITHUB_CLIENT_ID;
    const ORIGINAL_GH_SECRET = process.env.GITHUB_CLIENT_SECRET;

    beforeEach(() => {
      process.env.GITHUB_CLIENT_ID = 'test-gh-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'test-gh-client-secret';
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.user.create.mockReset();
      mockPrisma.user.update.mockReset();
    });

    afterEach(() => {
      if (ORIGINAL_GH_ID === undefined) delete process.env.GITHUB_CLIENT_ID;
      else process.env.GITHUB_CLIENT_ID = ORIGINAL_GH_ID;
      if (ORIGINAL_GH_SECRET === undefined) delete process.env.GITHUB_CLIENT_SECRET;
      else process.env.GITHUB_CLIENT_SECRET = ORIGINAL_GH_SECRET;
      vi.restoreAllMocks();
    });

    function setupGitHubMock(opts: {
      access_token: string;
      ghUser: { id: number; login: string; name: string | null; email: string | null };
    }): void {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(
            JSON.stringify({
              access_token: opts.access_token,
              token_type: 'bearer',
              scope: 'user:email',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://github.com/user') {
          return new Response(JSON.stringify(opts.ghUser), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
    }

    it('postMessage payload includes created: true for a new GitHub user', async () => {
      setupGitHubMock({
        access_token: 'gho_onboarding_test',
        ghUser: { id: 77777, login: 'newcat', name: 'New Cat', email: '[email protected]' },
      });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // by githubId → not found
        .mockResolvedValueOnce(null); // by email → not found
      mockPrisma.user.create.mockResolvedValue({
        id: 'gh-user-new',
        email: '[email protected]',
        name: 'New Cat',
      });

      const res = await request(app)
        .get('/auth/github/callback?code=valid-code&state=mystate')
        .set('Cookie', 'github_oauth_state=mystate');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      // The postMessage JSON is embedded in the HTML as `var msg = {...}`
      const match = res.text.match(/var msg = ({.*?});/s);
      expect(match).not.toBeNull();
      const msg = JSON.parse(match![1]);
      expect(msg.type).toBe('oauth-success');
      expect(msg.created).toBe(true);
    });

    it('postMessage payload includes created: false for an existing GitHub user', async () => {
      setupGitHubMock({
        access_token: 'gho_onboarding_test',
        ghUser: {
          id: 88888,
          login: 'existingcat',
          name: 'Existing Cat',
          email: '[email protected]',
        },
      });
      // findUnique by githubId returns existing user
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'gh-user-existing',
        email: '[email protected]',
        name: 'Existing Cat',
      });

      const res = await request(app)
        .get('/auth/github/callback?code=valid-code&state=mystate')
        .set('Cookie', 'github_oauth_state=mystate');

      expect(res.status).toBe(200);
      const match = res.text.match(/var msg = ({.*?});/s);
      expect(match).not.toBeNull();
      const msg = JSON.parse(match![1]);
      expect(msg.type).toBe('oauth-success');
      expect(msg.created).toBe(false);
    });
  });
});

describe('Admin Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    // requireAdmin now verifies the admin account OWNS its email via a linked
    // OAuth identity (googleId/githubId). Default the lookup to a verified admin
    // so the route tests below exercise the handlers, not the guard.
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'admin@example.com',
      googleId: 'g-admin',
      githubId: null,
    });
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  describe('requireAdmin middleware', () => {
    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/admin/metrics/overview')
        .set('Authorization', `Bearer ${TEST_NON_ADMIN_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('returns 401 for missing token', async () => {
      const res = await request(app).get('/admin/metrics/overview');

      expect(res.status).toBe(401);
    });

    it('allows admin user', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0 },
      });
      mockPrisma.usageEvent.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/admin/metrics/overview')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
    });

    it('returns 403 for an allowlisted email on a password-only (unverified) account', async () => {
      // Escalation guard: open registration lets anyone claim an unclaimed admin
      // email. Such an account has no OAuth link → admin must be denied even
      // though the email is in ADMIN_EMAILS.
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'admin@example.com',
        googleId: null,
        githubId: null,
      });

      const res = await request(app)
        .get('/admin/metrics/overview')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });
  });

  describe('GET /admin/metrics/overview', () => {
    it('returns KPIs with correct aggregates', async () => {
      mockPrisma.user.count.mockResolvedValue(42);
      mockPrisma.usageEvent.groupBy.mockResolvedValue([
        { userId: 'a' },
        { userId: 'b' },
        { userId: 'c' },
      ]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { inputTokens: 50000, outputTokens: 30000 },
      });
      mockPrisma.usageEvent.count.mockResolvedValue(150);

      const res = await request(app)
        .get('/admin/metrics/overview')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(42);
      expect(res.body.activeToday).toBe(3);
      expect(res.body.totalTokens).toBe(80000);
      expect(res.body.totalRequests).toBe(150);
    });

    it('does not expose any PII', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.usageEvent.groupBy.mockResolvedValue([]);
      mockPrisma.usageEvent.aggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0 },
      });
      mockPrisma.usageEvent.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/admin/metrics/overview')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('users');
      expect(res.body).not.toHaveProperty('emails');
      expect(res.body).not.toHaveProperty('userIds');
      expect(res.body).not.toHaveProperty('messages');
      expect(JSON.stringify(res.body)).not.toContain('@');
    });
  });

  describe('GET /admin/metrics/registrations', () => {
    it('returns daily registration counts', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: new Date('2026-06-01T00:00:00Z'), count: BigInt(3) },
      ]);

      const res = await request(app)
        .get('/admin/metrics/registrations?period=30d')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(res.body.days).toBeInstanceOf(Array);
      expect(res.body.days.length).toBe(30);
      expect(res.body.days[0]).toHaveProperty('date');
      expect(res.body.days[0]).toHaveProperty('count');
    });

    it('defaults to 30d when no period specified', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const res = await request(app)
        .get('/admin/metrics/registrations')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
    });

    it('supports 90d period', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const res = await request(app)
        .get('/admin/metrics/registrations?period=90d')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('90d');
      expect(res.body.days.length).toBe(90);
    });
  });

  describe('GET /admin/metrics/active-users', () => {
    it('returns daily active users', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: new Date('2026-06-01T00:00:00Z'), count: BigInt(5) },
        { date: new Date('2026-06-02T00:00:00Z'), count: BigInt(3) },
      ]);

      const res = await request(app)
        .get('/admin/metrics/active-users?period=30d')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(res.body.days).toBeInstanceOf(Array);
      expect(res.body.days[0]).toMatchObject({ date: '2026-06-01', count: 5 });
      expect(res.body.days[1]).toMatchObject({ date: '2026-06-02', count: 3 });
    });

    it('does not expose userIds', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: new Date('2026-06-01T00:00:00Z'), count: BigInt(1) },
      ]);

      const res = await request(app)
        .get('/admin/metrics/active-users')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('userId');
    });
  });

  describe('GET /admin/metrics/usage', () => {
    it('returns usage grouped by provider and model', async () => {
      mockPrisma.usageEvent.groupBy
        .mockResolvedValueOnce([
          {
            providerId: 'openai',
            _sum: { inputTokens: 5000, outputTokens: 3000 },
            _count: { id: 10 },
          },
          {
            providerId: 'anthropic',
            _sum: { inputTokens: 2000, outputTokens: 1000 },
            _count: { id: 5 },
          },
        ])
        .mockResolvedValueOnce([
          {
            providerId: 'openai',
            modelId: 'gpt-4o',
            _sum: { inputTokens: 5000, outputTokens: 3000 },
            _count: { id: 10 },
          },
        ]);

      const res = await request(app)
        .get('/admin/metrics/usage?period=30d')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(res.body.byProvider).toHaveLength(2);
      expect(res.body.byProvider[0]).toMatchObject({
        providerId: 'openai',
        totalTokens: 8000,
        totalRequests: 10,
      });
      expect(res.body.byModel).toHaveLength(1);
      expect(res.body.byModel[0]).toMatchObject({
        providerId: 'openai',
        modelId: 'gpt-4o',
      });
    });

    it('does not expose userIds', async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/admin/metrics/usage?period=30d')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('userId');
    });
  });

  describe('GET /admin/metrics/modes', () => {
    it('returns single vs council counts', async () => {
      mockPrisma.usageEvent.groupBy.mockResolvedValue([
        { mode: 'single', _count: { id: 200 } },
        { mode: 'council', _count: { id: 30 } },
      ]);

      const res = await request(app)
        .get('/admin/metrics/modes?period=30d')
        .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(res.body.modes).toEqual([
        { mode: 'single', count: 200 },
        { mode: 'council', count: 30 },
      ]);
    });
  });
});

describe('GET /admin/metrics/usage-heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it('returns 180 days of global usage for an admin', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/admin/metrics/usage-heatmap')
      .set('Authorization', `Bearer ${TEST_ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(180);
    expect(res.body.totalTokens).toBe(0);
    expect(res.body.activeDays).toBe(0);
  });

  it('rejects non-admin users with 403', async () => {
    const res = await request(app)
      .get('/admin/metrics/usage-heatmap')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /providers/:id — cleanup of dependent state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: provider config exists with the requested id and providerId='deepseek'.
    mockPrisma.providerConfig.findUnique.mockImplementation(({ where }) => {
      if (where.id === 'pc-deepseek') {
        return Promise.resolve({ id: 'pc-deepseek', providerId: 'deepseek', userId: 'test-user' });
      }
      return Promise.resolve(null);
    });
    mockPrisma.providerConfig.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.activeModelsConfig.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.councilConfig.findUnique.mockResolvedValue(null);
    mockPrisma.councilConfig.upsert.mockResolvedValue({});
    mockPrisma.councilConfig.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('removes the active models allow-list for the disconnected provider', async () => {
    const res = await request(app)
      .delete('/providers/pc-deepseek')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(204);
    expect(mockPrisma.activeModelsConfig.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'test-user', providerId: 'deepseek' },
    });
  });

  it('filters CouncilConfig.modelIds to drop the disconnected provider', async () => {
    mockPrisma.councilConfig.findUnique.mockResolvedValue({
      id: 'cc-1',
      userId: 'test-user',
      mode: 'manual',
      modelIds: ['deepseek:deepseek-v4-flash', 'openai:gpt-5.4', 'kimi-for-coding:k2p5'],
    });
    mockPrisma.councilConfig.upsert.mockResolvedValue({
      id: 'cc-1',
      userId: 'test-user',
      mode: 'manual',
      modelIds: ['openai:gpt-5.4', 'kimi-for-coding:k2p5'],
    });

    const res = await request(app)
      .delete('/providers/pc-deepseek')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(204);
    expect(mockPrisma.councilConfig.upsert).toHaveBeenCalledWith({
      where: { userId: 'test-user' },
      update: {
        modelIds: ['openai:gpt-5.4', 'kimi-for-coding:k2p5'],
        mode: 'manual',
      },
      create: expect.objectContaining({
        userId: 'test-user',
        modelIds: ['openai:gpt-5.4', 'kimi-for-coding:k2p5'],
        mode: 'manual',
      }),
    });
    expect(mockPrisma.councilConfig.deleteMany).not.toHaveBeenCalled();
  });

  it('resets CouncilConfig to auto when filtering leaves fewer than 2 members', async () => {
    mockPrisma.councilConfig.findUnique.mockResolvedValue({
      id: 'cc-1',
      userId: 'test-user',
      mode: 'manual',
      modelIds: ['deepseek:deepseek-v4-flash', 'openai:gpt-5.4'],
    });

    const res = await request(app)
      .delete('/providers/pc-deepseek')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(204);
    // Single surviving member is below the manual minimum of 2, so the row is
    // removed and the Council falls back to its auto default.
    expect(mockPrisma.councilConfig.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'test-user' },
    });
    expect(mockPrisma.councilConfig.upsert).not.toHaveBeenCalled();
  });

  it('does not touch CouncilConfig.modelIds when mode is auto', async () => {
    mockPrisma.councilConfig.findUnique.mockResolvedValue({
      id: 'cc-1',
      userId: 'test-user',
      mode: 'auto',
      modelIds: [],
    });

    const res = await request(app)
      .delete('/providers/pc-deepseek')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(204);
    expect(mockPrisma.councilConfig.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.councilConfig.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 204 even when the provider does not belong to the user (idempotent)', async () => {
    mockPrisma.providerConfig.findUnique.mockResolvedValue(null);
    mockPrisma.providerConfig.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .delete('/providers/pc-foreign')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(204);
    expect(mockPrisma.activeModelsConfig.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.councilConfig.upsert).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth rate limiting — regression guard.
//
// The limiter is mounted with `app.use('/auth', authLimiter, authRoutes)`.
// Express strips the mount prefix, so INSIDE the limiter `req.path` is `/login`,
// NOT `/auth/login`. The original skip predicate compared `req.path` against the
// full `/auth/...` strings, so it never matched and the limiter skipped EVERY
// request — leaving login/register/google with zero brute-force protection.
//
// The limiter self-skips when NODE_ENV === 'test' (the reason the bug survived
// the suite), so these tests flip NODE_ENV to engage it exactly as in prod.
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth rate limiting', () => {
  const realNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // The skip predicate reads process.env.NODE_ENV per request; flip it so the
    // limiter behaves as it does in production. Restored in afterEach.
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = realNodeEnv;
  });

  it('blocks /auth/login past the limit (req.path is mount-relative "/login")', async () => {
    const statuses: number[] = [];
    // limit = 20 per window → the 21st request must be rejected with 429.
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'bruteforce@example.com', password: 'x' });
      statuses.push(res.status);
    }

    // First 20 reach the handler (401 invalid creds) — none rate-limited.
    expect(statuses.slice(0, 20).some((s) => s === 429)).toBe(false);
    // The 21st is blocked by the limiter.
    expect(statuses[20]).toBe(429);
  });

  it('never blocks /auth/refresh (the frontend calls it automatically on 401)', async () => {
    // Even with the per-IP bucket already saturated by the login test, refresh
    // must stay exempt — it is not in the limited set, so the frontend's
    // automatic refresh-on-401 never exhausts the bucket.
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/auth/refresh');
      statuses.push(res.status);
    }

    expect(statuses.every((s) => s !== 429)).toBe(true);
  });
});
