import { Router } from 'express';
import { z } from 'zod';
import { CreateConversationSchema } from '@chat/sdk';
import { route } from '@chat/router';
import { prisma } from '../lib/db';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { selectConfiguredProvider } from '../lib/select-provider';
import { generateConversationTitle } from '../lib/title';
import { streamHub } from '../lib/stream-hub';
import { searchConversations } from '../lib/conversation-search';

const router = Router();

const SearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.coerce.number().int().positive().optional().catch(undefined),
});

// Full-text search endpoint — MUST be registered BEFORE /:id so Express does
// not match the literal string "search" as a conversation ID param.

router.get('/search', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = SearchQuerySchema.parse(req.query);
    const rawQ = parsed.q;
    const limit = parsed.limit ? Math.min(parsed.limit, 50) : 20;

    const results = await searchConversations(req.userId!, rawQ, limit);
    res.json({ results });
  } catch (err) {
    req.log?.error({ err }, 'failed to search conversations');
    res.status(500).json({ error: 'Failed to search conversations' });
  }
});

// Local to the route — a rename only ever touches the title. Kept here (not in
// @chat/sdk) so it doesn't require rebuilding the package's dist to be picked up.
const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
    });
    res.json(conversations);
  } catch (err) {
    req.log.error({ err }, 'failed to fetch conversations');
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.userId, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            councilTurn: {
              include: {
                voices: true,
              },
            },
          },
        },
      },
    });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    // Tell the client whether a generation is still running in the background for
    // this conversation, so it can re-attach to the live stream (P.1) instead of
    // showing a frozen partial answer.
    res.json({ ...conversation, isStreaming: streamHub.isActive(conversation.id) });
  } catch (err) {
    req.log.error({ err }, 'failed to fetch conversation');
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

router.post(
  '/',
  authMiddleware,
  validateBody(CreateConversationSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { title, modelUsed } = req.body;
      const conversation = await prisma.conversation.create({
        data: {
          userId: req.userId!,
          title: title ?? 'New Conversation',
          modelUsed,
        },
      });
      res.status(201).json(conversation);
    } catch (err) {
      req.log.error({ err }, 'failed to create conversation');
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  }
);

// Rename. Ownership-checked (404, never 403) and limited to active (non-deleted)
// conversations, consistent with the read/delete routes.
router.patch(
  '/:id',
  authMiddleware,
  validateBody(UpdateConversationSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { title } = req.body;
      const conversation = await prisma.conversation.findFirst({
        where: { id: req.params.id, userId: req.userId, deletedAt: null },
      });
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { title },
      });
      res.json(updated);
    } catch (err) {
      req.log.error({ err }, 'failed to rename conversation');
      res.status(500).json({ error: 'Failed to rename conversation' });
    }
  }
);

// Re-title a historical conversation. Title auto-generation only fires on the
// first exchange of brand-new conversations, so older chats keep their verbatim
// first-message title. This endpoint regenerates one on demand using the same
// provider-selection logic as the chat routes. (P.3)
router.post('/:id/retitle', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.userId, deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const firstUser = conversation.messages.find((m) => m.role === 'user');
    const firstAssistant = conversation.messages.find((m) => m.role === 'assistant');
    if (!firstUser || !firstAssistant) {
      res.status(400).json({ error: 'Conversation has no exchange to summarize' });
      return;
    }

    const decision = route(
      { messages: [{ role: 'user', content: firstUser.content }], model: 'gpt-4o' },
      {}
    );
    const selected = await selectConfiguredProvider(decision, req.userId!);
    if (!selected) {
      res.status(400).json({ error: 'No connected provider available to generate a title' });
      return;
    }

    const title = await generateConversationTitle(
      selected.provider,
      selected.model.modelId,
      selected.credential.apiKey,
      firstUser.content,
      firstAssistant.content
    );
    if (!title) {
      res.status(422).json({ error: 'Could not generate a title' });
      return;
    }

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { title },
    });
    res.json({ title: updated.title });
  } catch (err) {
    req.log.error({ err }, 'failed to retitle conversation');
    res.status(500).json({ error: 'Failed to retitle conversation' });
  }
});

// Soft delete: stamp `deletedAt` so history can be purged/restored later.
// Ownership failures return 404 (never 403) — same policy as the chat routes,
// so a client can't probe which conversation IDs belong to other users.
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.userId, deletedAt: null },
    });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { deletedAt: new Date() },
    });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, 'failed to delete conversation');
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
