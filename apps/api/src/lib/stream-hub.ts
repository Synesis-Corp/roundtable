import type { Response } from 'express';

/**
 * In-memory hub for in-flight SSE generations, keyed by conversationId.
 *
 * Why this exists: a chat/council generation used to be bound to the HTTP
 * request — if the client navigated away, `req.on("close")` aborted it and the
 * answer was lost. This hub decouples the generation from any single connection:
 * the producer (chat/council route) publishes events here, and zero or more
 * subscribers (the original request, plus any later reconnect) fan them out.
 * Disconnecting a subscriber no longer stops the work.
 *
 * Single-process, single-instance by design (matches the current single-container
 * deployment). For a multi-instance deployment this would move to a shared bus
 * (Redis pub/sub + a durable buffer); the producer/subscriber API stays the same.
 */

export type StreamStatus = 'running' | 'done' | 'error';

export interface StreamSession {
  conversationId: string;
  userId: string;
  /** Every event published so far, for replay to subscribers that join late. */
  events: unknown[];
  status: StreamStatus;
  error?: string;
  subscribers: Set<Response>;
  /** Aborts the background generation. NOT tied to any single request. */
  abort: AbortController;
  createdAt: number;
  evictTimer?: ReturnType<typeof setTimeout>;
}

/** How long a finished session lingers so a late reconnect can still replay it. */
const EVICT_AFTER_MS = 30_000;

function serialize(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export class StreamHub {
  private sessions = new Map<string, StreamSession>();

  /**
   * Register a fresh session for a conversation. If one already exists (e.g. the
   * user re-sent on the same conversation), the old one is aborted and dropped so
   * there's only ever one live generation per conversation.
   */
  create(conversationId: string, userId: string): StreamSession {
    if (this.sessions.has(conversationId)) this.evict(conversationId);
    const session: StreamSession = {
      conversationId,
      userId,
      events: [],
      status: 'running',
      subscribers: new Set(),
      abort: new AbortController(),
      createdAt: Date.now(),
    };
    this.sessions.set(conversationId, session);
    return session;
  }

  get(conversationId: string): StreamSession | undefined {
    return this.sessions.get(conversationId);
  }

  /** True only while a generation for this conversation is actively running. */
  isActive(conversationId: string): boolean {
    return this.sessions.get(conversationId)?.status === 'running';
  }

  /** Buffer an event and fan it out to every live subscriber. */
  publish(session: StreamSession, event: unknown): void {
    session.events.push(event);
    const data = serialize(event);
    for (const res of session.subscribers) {
      try {
        res.write(data);
      } catch {
        session.subscribers.delete(res);
      }
    }
  }

  /**
   * Attach a connection: replay everything buffered so far, then keep it live.
   * If the session is already finished, the replay is the whole story — close it.
   */
  subscribe(session: StreamSession, res: Response): void {
    for (const event of session.events) {
      try {
        res.write(serialize(event));
      } catch {
        return;
      }
    }
    if (session.status === 'running') {
      session.subscribers.add(res);
    } else {
      try {
        res.end();
      } catch {
        /* already closed */
      }
    }
  }

  /** Detach a connection without affecting the generation (the client left). */
  unsubscribe(session: StreamSession, res: Response): void {
    session.subscribers.delete(res);
  }

  /** Mark the generation finished, close live subscribers, schedule eviction. */
  finish(session: StreamSession, status: StreamStatus, error?: string): void {
    session.status = status;
    session.error = error;
    for (const res of session.subscribers) {
      try {
        res.end();
      } catch {
        /* already closed */
      }
    }
    session.subscribers.clear();
    if (session.evictTimer) clearTimeout(session.evictTimer);
    session.evictTimer = setTimeout(
      () => this.sessions.delete(session.conversationId),
      EVICT_AFTER_MS
    );
    // Don't keep the event loop alive just for cleanup.
    if (typeof session.evictTimer === 'object' && 'unref' in session.evictTimer) {
      (session.evictTimer as { unref: () => void }).unref();
    }
  }

  /** Abort + drop a session immediately (and clear any pending eviction). */
  evict(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (!session) return;
    if (session.status === 'running') session.abort.abort();
    for (const res of session.subscribers) {
      try {
        res.end();
      } catch {
        /* already closed */
      }
    }
    session.subscribers.clear();
    if (session.evictTimer) clearTimeout(session.evictTimer);
    this.sessions.delete(conversationId);
  }
}

export const streamHub = new StreamHub();
