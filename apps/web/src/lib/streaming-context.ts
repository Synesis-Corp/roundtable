import { createContext, useContext } from "react";

/**
 * Shared "is a response currently streaming?" signal.
 *
 * The stream lives inside ChatPage, but the sidebar (Layout) needs to know about
 * it so it can guard navigation — switching conversations or starting a new chat
 * mid-stream would silently drop the in-flight answer (and the message just sent).
 * ChatPage publishes its streaming state here; Layout reads it to confirm before
 * navigating away.
 */
export interface StreamingState {
  streaming: boolean;
  setStreaming: (value: boolean) => void;
}

export const StreamingContext = createContext<StreamingState>({
  streaming: false,
  setStreaming: () => {},
});

export function useStreaming(): StreamingState {
  return useContext(StreamingContext);
}
