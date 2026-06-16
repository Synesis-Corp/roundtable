import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';

const TEST_TOKEN = jwt.sign({ userId: 'user-a' }, process.env.JWT_SECRET);

const mockPrisma = vi.hoisted(() => ({
  memory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../lib/db', () => ({ prisma: mockPrisma }));

const { default: memoryRoutes } = await import('./memory');

const app = express();
app.use(express.json());
app.use('/memory', memoryRoutes);

const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };
const memory = {
  id: 'memory-1',
  userId: 'user-a',
  content: 'Prefiere respuestas directas',
  sourceType: 'manual',
  sourceConversationId: null,
  tags: ['preferencia'],
  createdAt: new Date('2026-06-12T18:00:00.000Z'),
  updatedAt: new Date('2026-06-12T18:00:00.000Z'),
};

describe('memory routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for the memory collection', async () => {
    const response = await request(app).get('/memory');

    expect(response.status).toBe(401);
    expect(mockPrisma.memory.findMany).not.toHaveBeenCalled();
  });

  it('lists only the current user memories ordered by recent updates', async () => {
    mockPrisma.memory.findMany.mockResolvedValue([memory]);

    const response = await request(app).get('/memory').set(authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'memory-1',
        userId: 'user-a',
        content: 'Prefiere respuestas directas',
      }),
    ]);
    expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('creates a trimmed manual memory with normalized unique tags', async () => {
    mockPrisma.memory.create.mockResolvedValue(memory);

    const response = await request(app)
      .post('/memory')
      .set(authHeader)
      .send({
        content: '  Prefiere respuestas directas  ',
        tags: [' Preferencia ', 'PRODUCTO', 'preferencia'],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('memory-1');
    expect(mockPrisma.memory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-a',
        content: 'Prefiere respuestas directas',
        sourceType: 'manual',
        sourceConversationId: null,
        tags: ['preferencia', 'producto'],
      },
    });
  });

  it('rejects invalid create payloads at the Zod boundary', async () => {
    const response = await request(app)
      .post('/memory')
      .set(authHeader)
      .send({
        content: '   ',
        tags: ['ok'],
        userId: 'user-b',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(mockPrisma.memory.create).not.toHaveBeenCalled();
  });

  it('updates content and tags only after verifying ownership', async () => {
    mockPrisma.memory.findFirst.mockResolvedValue(memory);
    mockPrisma.memory.update.mockResolvedValue({
      ...memory,
      content: 'Trabaja en Roundtable',
      tags: ['proyecto'],
    });

    const response = await request(app)
      .patch('/memory/memory-1')
      .set(authHeader)
      .send({
        content: '  Trabaja en Roundtable ',
        tags: [' Proyecto ', 'proyecto'],
      });

    expect(response.status).toBe(200);
    expect(response.body.content).toBe('Trabaja en Roundtable');
    expect(mockPrisma.memory.findFirst).toHaveBeenCalledWith({
      where: { id: 'memory-1', userId: 'user-a' },
    });
    expect(mockPrisma.memory.update).toHaveBeenCalledWith({
      where: { id: 'memory-1' },
      data: { content: 'Trabaja en Roundtable', tags: ['proyecto'] },
    });
  });

  it('returns 404 instead of revealing another user memory on update', async () => {
    mockPrisma.memory.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch('/memory/other-user-memory')
      .set(authHeader)
      .send({ content: 'Intento de edición' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Memory not found');
    expect(mockPrisma.memory.update).not.toHaveBeenCalled();
  });

  it('rejects empty update payloads', async () => {
    const response = await request(app).patch('/memory/memory-1').set(authHeader).send({});

    expect(response.status).toBe(400);
    expect(mockPrisma.memory.findFirst).not.toHaveBeenCalled();
  });

  it('deletes an owned memory', async () => {
    mockPrisma.memory.findFirst.mockResolvedValue(memory);
    mockPrisma.memory.delete.mockResolvedValue(memory);

    const response = await request(app).delete('/memory/memory-1').set(authHeader);

    expect(response.status).toBe(204);
    expect(mockPrisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'memory-1' } });
  });

  it('returns 404 instead of revealing another user memory on delete', async () => {
    mockPrisma.memory.findFirst.mockResolvedValue(null);

    const response = await request(app).delete('/memory/other-user-memory').set(authHeader);

    expect(response.status).toBe(404);
    expect(mockPrisma.memory.delete).not.toHaveBeenCalled();
  });
});
