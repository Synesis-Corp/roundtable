import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const ContentSchema = z.string().trim().min(1).max(2_000);
const TagsSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(20)
  .default([])
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]);

const CreateMemorySchema = z
  .object({
    content: ContentSchema,
    tags: TagsSchema,
  })
  .strict();

const UpdateMemorySchema = z
  .object({
    content: ContentSchema.optional(),
    tags: TagsSchema.optional(),
  })
  .strict()
  .refine((input) => input.content !== undefined || input.tags !== undefined, {
    message: 'At least one field is required',
  });

interface MemoryDelegate {
  findMany(args: { where: { userId: string }; orderBy: { updatedAt: 'desc' } }): Promise<unknown[]>;
  findFirst(args: { where: { id: string; userId: string } }): Promise<{ id: string } | null>;
  create(args: {
    data: {
      userId: string;
      content: string;
      sourceType: 'manual';
      sourceConversationId: null;
      tags: string[];
    };
  }): Promise<unknown>;
  update(args: {
    where: { id: string };
    data: { content?: string; tags?: string[] };
  }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

// The Memory schema/client is landing in parallel. Keeping this route behind a
// narrow delegate avoids coupling route tests to a regenerated Prisma client.
const memoryDelegate = (prisma as unknown as { memory: MemoryDelegate }).memory;

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const memories = await memoryDelegate.findMany({
      where: { userId: req.userId! },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(memories);
  } catch (err) {
    req.log.error({ err }, 'failed to list memories');
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

router.post(
  '/',
  authMiddleware,
  validateBody(CreateMemorySchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const created = await memoryDelegate.create({
        data: {
          userId: req.userId!,
          content: req.body.content,
          sourceType: 'manual',
          sourceConversationId: null,
          tags: req.body.tags,
        },
      });
      res.status(201).json(created);
    } catch (err) {
      req.log.error({ err }, 'failed to create memory');
      res.status(500).json({ error: 'Failed to create memory' });
    }
  }
);

router.patch(
  '/:id',
  authMiddleware,
  validateBody(UpdateMemorySchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await memoryDelegate.findFirst({
        where: { id: req.params.id, userId: req.userId! },
      });
      if (!existing) {
        res.status(404).json({ error: 'Memory not found' });
        return;
      }

      const updated = await memoryDelegate.update({
        where: { id: existing.id },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      req.log.error({ err }, 'failed to update memory');
      res.status(500).json({ error: 'Failed to update memory' });
    }
  }
);

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await memoryDelegate.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    await memoryDelegate.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, 'failed to delete memory');
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

export default router;
