import type { Response } from 'express';
import { ChatMessagesSchema } from '@chat/sdk';

/**
 * Validates the shape of a resolved chat `messages` array against the Zod
 * schema. Returns true when valid; on failure it responds 400 and returns
 * false so the caller can `return` early. Runs AFTER the multipart/JSON parser
 * so it complements (does not replace) the parser's presence/JSON checks.
 */
export function ensureValidMessages(messages: unknown, res: Response): boolean {
  const result = ChatMessagesSchema.safeParse(messages);
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid messages',
      details: result.error.flatten(),
    });
    return false;
  }
  return true;
}
