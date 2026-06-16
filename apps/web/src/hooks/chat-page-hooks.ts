/* ------------------------------------------------------------------ */
/*  Simple hooks extracted from ChatPage.                              */
/*  Each hook is self-contained, testable, and has a single concern.   */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from 'react';
import { storage } from '../lib/storage';
import { NEW_CHAT_EVENT } from '../lib/chat-page-helpers';

/**
 * Derives a friendly username from the JWT in storage.
 * Falls back to "" (no personalized greeting) if the token is missing or malformed.
 */
export function useUsernameFromToken(): string {
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const token = storage.get('token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.email) setUserName(payload.email.split('@')[0]);
    } catch {
      // Malformed token — ignore, user just won't get a personalized greeting.
    }
  }, []);

  return userName;
}

/**
 * Listens for the `roundtable:new-chat` window event and invokes the
 * provided reset callback. Used by the sidebar's "New chat" button.
 */
export function useNewChatListener(reset: () => void): void {
  useEffect(() => {
    const handler = () => reset();
    window.addEventListener(NEW_CHAT_EVENT, handler);
    return () => window.removeEventListener(NEW_CHAT_EVENT, handler);
  }, [reset]);
}

/**
 * Watches `location.state.newChatAt` and calls `reset` when the value
 * changes (signals a navigation to a fresh chat from the sidebar).
 * Uses a ref to dedupe across re-renders (the same value can come through
 * `location.state` repeatedly without an actual navigation event).
 */
export function useRouteNewChatTrigger(
  locationState: { newChatAt?: number } | null,
  reset: () => void
): void {
  const newChatAt = locationState?.newChatAt ?? null;
  const lastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    if (!newChatAt || lastSeenRef.current === newChatAt) return;
    lastSeenRef.current = newChatAt;
    reset();
  }, [newChatAt, reset]);
}

/**
 * Listens for paste events on document and appends image / application /
 * text files to the provided setter. Strips the default "image.png" name
 * from clipboard images and replaces it with `paste-<timestamp>.<ext>`.
 */
export function usePasteToAttach(setFiles: React.Dispatch<React.SetStateAction<File[]>>): void {
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const newFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (
          item.type.startsWith('image/') ||
          item.type.startsWith('application/') ||
          item.type.startsWith('text/')
        ) {
          const file = item.getAsFile();
          if (!file) continue;
          if (!file.name || file.name === 'image.png') {
            const ext = item.type.split('/')[1] || 'png';
            newFiles.push(new File([file], `paste-${Date.now()}.${ext}`, { type: item.type }));
          } else {
            newFiles.push(file);
          }
        }
      }
      if (newFiles.length > 0) {
        e.preventDefault();
        setFiles((prev) => [...prev, ...newFiles]);
      }
    };

    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [setFiles]);
}
