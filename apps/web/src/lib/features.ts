// Build-time feature flags (Vite inlines import.meta.env.VITE_* at build).

/**
 * ChatGPT Plus / Codex OAuth login for the OpenAI provider.
 *
 * The flow uses a localhost:1455 loopback callback, which only resolves when
 * the API runs on the user's OWN machine (desktop / native dev). In a hosted
 * deployment the OAuth redirect targets the user's localhost (where nothing is
 * listening) → ERR_CONNECTION_RESET. So it is disabled on hosted instances via
 * VITE_CODEX_ENABLED=false; OpenAI is connected by API key instead. Default on
 * to preserve the native/desktop experience.
 */
export const CODEX_ENABLED = import.meta.env.VITE_CODEX_ENABLED !== 'false';
