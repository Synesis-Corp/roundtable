import { useState, useCallback } from "react";

/**
 * Owns the `streaming` flag published to ChatPage via StreamingContext and the
 * guard that warns the user before navigating away from an in-progress response.
 */
export function useStreamingGuard() {
  // Published by ChatPage so the sidebar can guard navigation during a stream.
  const [streaming, setStreaming] = useState(false);

  // Returns false when the user cancels leaving an in-progress response.
  const confirmLeaveIfStreaming = useCallback(() => {
    if (!streaming) return true;
    return window.confirm(
      "Hay una respuesta en curso. Si salís ahora se perderá lo último que enviaste. ¿Salir igual?"
    );
  }, [streaming]);

  return { streaming, setStreaming, confirmLeaveIfStreaming };
}
