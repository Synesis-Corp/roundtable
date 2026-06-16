import { z } from "zod";

/**
 * Single source of truth for environment configuration. Validated ONCE at
 * startup so a missing/short secret aborts the process with a clear message
 * instead of failing deep inside a request handler. The per-module guards in
 * crypto/auth remain as defense-in-depth.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  ENCRYPTION_SECRET: z.string().min(32, "must be at least 32 characters"),
  ENCRYPTION_SALT: z.string().min(16, "must be at least 16 characters"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Reverse-proxy hops in front of the API (see index.ts). 1 = container nginx
  // exposed directly; 2 = also behind a host nginx (shared-server topology).
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  // Public path the refresh cookie is scoped to (see refresh-token.ts). "/auth"
  // for native dev; "/api/auth" when the API is proxied under an /api prefix.
  REFRESH_COOKIE_PATH: z.string().optional(),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  FRONTEND_URL: z.string().url().optional(),
  // Optional: enables Google sign-in. The /auth/google route returns 503 if unset.
  GOOGLE_CLIENT_ID: z.string().optional(),
  // Optional: enables GitHub sign-in. Both the public id and the secret must
  // be set; the /auth/github route returns 503 if either is missing. The
  // secret is only ever used server-side to exchange the auth code.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  // SearXNG instance for the web_search tool. In docker compose, the service
  // name resolves to the container. In dev native, override with
  // SEARXNG_URL=http://localhost:8888 in your .env. If unset, the tool
  // returns a soft error and the model continues without search.
  SEARXNG_URL: z.string().url().default("http://searxng:8080"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validates process.env against the schema. On failure, prints every offending
 * variable and exits(1) — fail fast at boot. Returns the typed, coerced config.
 */
export function validateEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`\n[ERROR] Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

/**
 * Allowed CORS origins, derived from WEB_URL (+ FRONTEND_URL if set). Used by
 * the app setup, which runs even under test, so it reads process.env directly
 * with a safe default rather than the validated config.
 */
export function corsOrigins(): string[] {
  const origins = new Set<string>();
  for (const raw of [process.env.WEB_URL, process.env.FRONTEND_URL]) {
    if (!raw) continue;
    for (const o of raw.split(",")) {
      const trimmed = o.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  if (origins.size === 0) origins.add("http://localhost:3000");
  return Array.from(origins);
}
