import multer from 'multer';
import type { Response, NextFunction } from 'express';
import type { Message } from '@chat/sdk';
import { extractAttachments } from './attachments';
import type { AuthenticatedRequest } from '../middleware/auth';

/** Shared upload middleware — 25MB per file, 10 files max. The size cap
 *  accommodates typical PDFs (papers, contracts, manuals) which commonly run
 *  5–20MB. nginx `client_max_body_size 100m` is the outer ceiling. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

/** Wraps multer upload with proper MulterError → 413/400 status codes. */
export function uploadFiles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  upload.array('files', 10)(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
          return res.status(413).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Upload failed' });
    }
    next();
  });
}

/**
 * Parses multipart/form-data request body and injects extracted attachments
 * into the last user message. Returns the parsed messages, conversationId,
 * and whether parsing succeeded.
 *
 * When no multipart is detected, the caller falls through to req.body.
 */
export async function parseMultipartBody(req: AuthenticatedRequest): Promise<
  | {
      messages: Message[];
      preferences: Record<string, unknown>;
      conversationId: string | undefined;
      ok: true;
    }
  | { ok: false; error: string; status: number }
> {
  let messages: Message[];
  let preferences: Record<string, unknown> = {};

  try {
    if (!req.body.messages) {
      return { ok: false, error: "Missing 'messages' field in multipart request", status: 400 };
    }
    messages = JSON.parse(req.body.messages) as Message[];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: "'messages' must be a non-empty array", status: 400 };
    }
  } catch {
    return { ok: false, error: "Invalid JSON in 'messages' field", status: 400 };
  }

  // Preferences are optional — `/chat/multi` doesn't send them.
  try {
    if (req.body.preferences) {
      preferences = JSON.parse(req.body.preferences);
    }
  } catch {
    return { ok: false, error: "Invalid JSON in 'preferences' field", status: 400 };
  }

  const conversationId = req.body.conversationId ?? undefined;

  // Extract attachments from uploaded files (now async because of PDF text extraction)
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const attachments = await extractAttachments(files);

  if (attachments.length > 0) {
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      const userMsg = messages[lastUserIdx];
      if (!userMsg.content || userMsg.content.trim() === '') {
        userMsg.content = 'Analyze this:';
      }
      userMsg.attachments = [...(userMsg.attachments ?? []), ...attachments];
    }
  }

  return { messages, preferences, conversationId, ok: true };
}
