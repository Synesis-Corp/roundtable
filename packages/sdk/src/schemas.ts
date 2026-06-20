import { z } from 'zod';

// Validation schemas shared across the API surface. These guard the request
// boundary so malformed input is rejected with a 400 instead of crashing a
// handler deeper in the stack.

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// The `credential` is the ID token (JWT) returned by Google Identity Services.
// It is verified server-side; never trust it without verifyIdToken.
export const GoogleAuthSchema = z.object({
  credential: z.string().min(1, 'Missing Google credential'),
});

export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  modelUsed: z.string().min(1).optional(),
});

// Chat message structure. Validated AFTER the multipart/JSON parser has
// resolved the array, so it complements (does not replace) the parser's
// presence/JSON/non-empty checks: this guards the shape of each message.
export const ChatAttachmentSchema = z.object({
  type: z.enum(['text', 'image', 'file', 'audio', 'pdf']),
  url: z.string().optional(),
  base64: z.string().optional(),
  mimeType: z.string().optional(),
  name: z.string().optional(),
  // Defensive caps: the API's PDF converter already truncates to 50K chars and
  // a sane page count, but the schema enforces the same on the wire in case a
  // client crafts a payload directly. Slightly looser than the server cap to
  // allow clients to send back older data that might exceed by a few chars.
  extractedText: z.string().max(60_000).optional(),
  pageCount: z.number().int().positive().optional(),
});

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  attachments: z.array(ChatAttachmentSchema).optional(),
});

export const ChatMessagesSchema = z.array(ChatMessageSchema).min(1);

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type GoogleAuthInput = z.infer<typeof GoogleAuthSchema>;
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

// ─── Provider Options ──────────────────────────────────────────────────────
// Guards against SSRF, header injection, and arbitrary endpoint configuration
// when users add custom OpenAI-compatible providers. See ADR in providers.ts.

const DANGEROUS_HOST_PATTERNS = [
  /^169\.254\./, // IPv4 link-local / cloud metadata (169.254.0.0/16)
  /^0\./, // 0.0.0.0/8 ("this" network; 0.0.0.0 can route to localhost)
  /^fe[89ab][0-9a-f]:/i, // Link-local IPv6 (fe80::/10)
  /^f[cd][0-9a-f]{2}:/i, // Unique local IPv6 (fc00::/7 — both fc.. and fd..)
  /^fec0:/i, // Site-local IPv6 (deprecated but blocked)
  /^ff[0-9a-f]{2}:/i, // Multicast IPv6 (ff00::/8)
] as const;

const DANGEROUS_HOSTNAMES = new Set([
  'metadata.google.internal', // GCP metadata
  'metadata', // Common cloud metadata short name
  '169.254.169.254', // AWS metadata IP
]);

/**
 * IPv4-mapped IPv6 lets an attacker smuggle a private/metadata IPv4 past the
 * plain IPv4 checks: `new URL()` serializes e.g. `::ffff:169.254.169.254` to its
 * hex form `::ffff:a9fe:a9fe`. Unwrap both the dotted and hex mapped forms back
 * to the embedded IPv4 so the IPv4 range checks catch them. (Decimal/hex IPv4
 * such as `2130706433` are already normalized to dotted form by `new URL()`.)
 */
function unwrapMappedIpv4(host: string): string {
  const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dotted) return dotted[1];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return host;
}

function isPrivateHost(hostname: string): boolean {
  // Normalize: drop IPv6 brackets, lowercase, and unwrap IPv4-mapped IPv6 so a
  // mapped private/metadata address can't slip past the IPv4 range checks.
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  host = unwrapMappedIpv4(host);

  // IPv6 unspecified (== 0.0.0.0). Loopback `::1` stays allowed for local LLMs,
  // consistent with the protocol-level allowance in the baseURL refine.
  if (host === '::' || host === '0:0:0:0:0:0:0:0') return true;

  // Block private / loopback IPv4 ranges
  if (/^10\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^127\./.test(host)) return true;

  // Block dangerous / metadata IP patterns
  for (const pattern of DANGEROUS_HOST_PATTERNS) {
    if (pattern.test(host)) return true;
  }

  // Block known cloud metadata hostnames
  if (DANGEROUS_HOSTNAMES.has(host)) return true;

  return false;
}

const ALLOWED_CUSTOM_HEADERS = new Set([
  // OpenRouter-specific
  'http-referer',
  'x-title',
  // Common provider headers
  'x-api-key',
  'x-request-id',
  'x-custom-auth',
  // OpenTelemetry / tracing
  'traceparent',
  'tracestate',
]);

function validateHeaders(headers: Record<string, string>): void {
  const entries = Object.entries(headers);
  if (entries.length > 10) {
    throw new Error('Maximum 10 custom headers allowed');
  }
  for (const [name, value] of entries) {
    // Header names: RFC 7230 token characters
    if (!/^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/.test(name)) {
      throw new Error(`Invalid header name: ${name}`);
    }
    if (name.length > 128) {
      throw new Error(`Header name too long: ${name}`);
    }
    // Header values: no newlines (CRLF injection prevention)
    if (typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error(`Header value contains invalid characters: ${name}`);
    }
    if (value.length > 4096) {
      throw new Error(`Header value too long: ${name}`);
    }
    // Block dangerous headers that affect routing/auth
    const lower = name.toLowerCase();
    if (lower === 'host' || lower.startsWith('x-forwarded') || lower === 'cookie') {
      throw new Error(`Header not allowed: ${name}`);
    }
    // Only allowlisted headers (case-insensitive)
    if (!ALLOWED_CUSTOM_HEADERS.has(lower)) {
      throw new Error(
        `Custom header not in allowlist: ${name}. Allowed: ${[...ALLOWED_CUSTOM_HEADERS].join(', ')}`
      );
    }
  }
}

export const ProviderOptionsSchema = z.object({
  baseURL: z
    .string()
    .url('baseURL must be a valid URL')
    .refine((url) => {
      const parsed = new URL(url);
      // Only https, except localhost (needed for local LLMs like Ollama)
      if (
        parsed.protocol !== 'https:' &&
        parsed.hostname !== 'localhost' &&
        !parsed.hostname.startsWith('127.') &&
        parsed.hostname !== '[::1]'
      ) {
        return false;
      }
      // Block private / dangerous hosts
      if (isPrivateHost(parsed.hostname)) {
        return false;
      }
      return true;
    }, 'baseURL must use HTTPS (or localhost for local LLMs) and must not target private/internal networks'),
  apiEndpoint: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^\/[a-zA-Z0-9/._-]+$/,
      'apiEndpoint must be a valid API path (e.g. /v1/chat/completions)'
    )
    .refine((p) => !p.includes('..'), 'apiEndpoint must not contain path traversal')
    .optional(),
  headers: z
    .record(z.string(), z.string())
    .refine(
      (headers) => {
        try {
          validateHeaders(headers);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid custom headers' }
    )
    .optional(),
});

export type ProviderOptionsInput = z.infer<typeof ProviderOptionsSchema>;

// ─── Council Configuration ─────────────────────────────────────────────────
// Validates user-selected council members for the deliberative mode.

export const CouncilConfigSchema = z.object({
  mode: z.enum(['auto', 'manual']).default('auto'),
  modelIds: z
    // modelId allows `/` because aggregators (OpenRouter, etc.) use
    // `vendor/model` ids, e.g. `openrouter:openrouter/auto`, `openrouter:x-ai/grok-4`.
    .array(z.string().regex(/^[a-z0-9-]+:[a-zA-Z0-9._/-]+$/, 'Must be provider:modelId format'))
    .min(2, 'Select at least 2 models')
    .max(8, 'Maximum 8 models allowed'),
});

export const UpdateCouncilConfigSchema = CouncilConfigSchema.partial().refine(
  (data) => data.mode !== undefined || data.modelIds !== undefined,
  { message: 'At least one field (mode or modelIds) must be provided' }
);

export type CouncilConfigInput = z.infer<typeof CouncilConfigSchema>;
export type UpdateCouncilConfigInput = z.infer<typeof UpdateCouncilConfigSchema>;
