import { createContext, useContext, useRef, type RefObject } from 'react';

type ComposerRef = RefObject<HTMLTextAreaElement | null>;

const ComposerFocusContext = createContext<ComposerRef | null>(null);

/**
 * Allows the global keyboard shortcut controller to focus the composer
 * textarea without prop-drilling a ref through Layout. Mounted once at
 * the layout level; ChatInputBar attaches its ref via the context, the
 * controller focuses it on the `/` shortcut.
 */
export function ComposerFocusProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return <ComposerFocusContext.Provider value={ref}>{children}</ComposerFocusContext.Provider>;
}

export function useComposerFocus(): ComposerRef {
  const ctx = useContext(ComposerFocusContext);
  return ctx ?? { current: null };
}
