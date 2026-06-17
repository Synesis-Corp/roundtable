import { useState, useCallback } from 'react';

import { useTranslation } from 'react-i18next';

/**
 * Owns the `streaming` flag published to ChatPage via StreamingContext and the
 * guard that warns the user before navigating away from an in-progress response.
 */
export function useStreamingGuard() {
  const { t } = useTranslation();
  // Published by ChatPage so the sidebar can guard navigation during a stream.
  const [streaming, setStreaming] = useState(false);

  // Returns false when the user cancels leaving an in-progress response.
  const confirmLeaveIfStreaming = useCallback(() => {
    if (!streaming) return true;
    return window.confirm(t('chat.confirmLeaveStreaming'));
  }, [streaming, t]);

  return { streaming, setStreaming, confirmLeaveIfStreaming };
}
