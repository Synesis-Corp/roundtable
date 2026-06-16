/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Google OAuth Client ID for "Sign in with Google". */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
