/**
 * Pure helpers + constants for the app shell (Layout / sidebar).
 * No React, no side effects — testable in isolation.
 */

/** localStorage key persisting the desktop sidebar collapsed state. */
export const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";

/** Window event ChatPage listens to so the composer can reset to a new chat. */
export const NEW_CHAT_EVENT = "roundtable:new-chat";

/** Map provider name → accent dot color. */
export function getProviderColor(provider?: string): string {
  switch (provider?.toLowerCase()) {
    case "openai":
      return "var(--m-green)";
    case "deepseek":
      return "var(--m-blue)";
    case "google":
      return "var(--m-violet)";
    case "anthropic":
      return "var(--m-amber)";
    default:
      return "var(--m-rose)";
  }
}

/** Human-readable provider label for the conversation dot tooltip. */
export function getProviderLabel(provider?: string): string {
  if (!provider) return "Modelo";
  switch (provider.toLowerCase()) {
    case "openai":
      return "OpenAI";
    case "deepseek":
      return "DeepSeek";
    case "google":
      return "Google";
    case "anthropic":
      return "Anthropic";
    case "multi":
    case "council":
    case "consensus":
      return "Consejo (varios modelos)";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}
