import type { Conversation } from '@chat/sdk';

/**
 * Context value the Layout passes down to its routed children via <Outlet>.
 * Lets ChatPage read the already-loaded conversation list (for contextual
 * prompt suggestions) without re-fetching /conversations.
 */
export interface LayoutOutletContext {
  conversations: Conversation[];
}
