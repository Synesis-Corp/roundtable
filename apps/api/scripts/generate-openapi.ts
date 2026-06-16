/**
 * Generates an OpenAPI 3.0 spec from the Zod schemas in @chat/sdk.
 * Run with: pnpm docs:openapi  (or pnpm --filter @chat/api docs:openapi)
 * Output: apps/api/openapi.json
 *
 * Uses manual JSON Schema mapping because @chat/sdk schemas use raw Zod
 * (not the extended Zod from @asteasolutions/zod-to-openapi which requires
 * Zod schemas to be created via its extendZod() helper).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodType } from 'zod';
import {
  RegisterSchema,
  LoginSchema,
  GoogleAuthSchema,
  CreateConversationSchema,
  ChatMessagesSchema,
  ProviderOptionsSchema,
  CouncilConfigSchema,
} from '@chat/sdk';

function toRef(schema: ZodType, name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function registerSchema(schemas: Record<string, unknown>, name: string, schema: ZodType) {
  (schemas as Record<string, unknown>)[name] = zodToJsonSchema(schema, name);
}

const schemas: Record<string, unknown> = {};
registerSchema(schemas, 'RegisterInput', RegisterSchema);
registerSchema(schemas, 'LoginInput', LoginSchema);
registerSchema(schemas, 'GoogleAuthInput', GoogleAuthSchema);
registerSchema(schemas, 'CreateConversationInput', CreateConversationSchema);
registerSchema(schemas, 'ChatMessages', ChatMessagesSchema);
registerSchema(schemas, 'ProviderOptions', ProviderOptionsSchema);
registerSchema(schemas, 'CouncilConfigInput', CouncilConfigSchema);

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'Roundtable API',
    version: '1.0.0',
    description:
      'Roundtable — fullstack TypeScript multiprovider AI chat. JWT + Google OAuth, encrypted API keys, Council deliberation, SSE streaming.',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local dev (API direct)' },
    { url: 'http://localhost/api', description: 'Local dev (via nginx)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas,
  },
  paths: {
    // ── Auth ────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        summary: 'Register a new user',
        security: [],
        requestBody: {
          content: { 'application/json': { schema: toRef(RegisterSchema, 'RegisterInput') } },
        },
        responses: {
          201: { description: 'User created' },
          409: { description: 'User already exists' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Log in with email + password',
        security: [],
        requestBody: {
          content: { 'application/json': { schema: toRef(LoginSchema, 'LoginInput') } },
        },
        responses: {
          200: { description: 'Access token + refresh cookie' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/google': {
      post: {
        summary: 'Sign in / sign up with Google (ID token)',
        security: [],
        requestBody: {
          content: { 'application/json': { schema: toRef(GoogleAuthSchema, 'GoogleAuthInput') } },
        },
        responses: {
          200: { description: 'Access token + refresh cookie' },
          401: { description: 'Invalid ID token' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Exchange refresh cookie for a new access token (rotation)',
        security: [],
        responses: {
          200: { description: 'New access token' },
          401: { description: 'Invalid refresh token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Revoke refresh token and clear cookie',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Token revoked' } },
      },
    },
    // ── Conversations ───────────────────────────────────────────────
    '/conversations': {
      get: {
        summary: 'List active conversations for the current user',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Array of conversations' } },
      },
      post: {
        summary: 'Create a new conversation',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: toRef(CreateConversationSchema, 'CreateConversationInput'),
            },
          },
        },
        responses: { 201: { description: 'Conversation created' } },
      },
    },
    '/conversations/{id}': {
      get: {
        summary: 'Get a single conversation with messages',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Conversation' }, 404: { description: 'Not found' } },
      },
      patch: {
        summary: 'Rename a conversation',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: toRef(CreateConversationSchema, 'CreateConversationInput'),
            },
          },
        },
        responses: {
          200: { description: 'Conversation renamed' },
          404: { description: 'Not found' },
        },
      },
      delete: {
        summary: 'Soft-delete a conversation',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Deleted' }, 404: { description: 'Not found' } },
      },
    },
    // ── Chat ────────────────────────────────────────────────────────
    '/chat/stream': {
      post: {
        summary: 'Single-model chat with SSE streaming',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: toRef(ChatMessagesSchema, 'ChatMessages') } },
        },
        responses: { 200: { description: 'SSE stream (text/event-stream)' } },
      },
    },
    '/chat/multi': {
      post: {
        summary: 'Council / multi-model deliberation with SSE streaming',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: toRef(ChatMessagesSchema, 'ChatMessages') } },
        },
        responses: { 200: { description: 'SSE stream (text/event-stream)' } },
      },
    },
    // ── Providers ───────────────────────────────────────────────────
    '/providers': {
      get: {
        summary: 'List available AI providers and models',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Provider list with models' } },
      },
      post: {
        summary: 'Add or update a provider credential',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': { schema: toRef(ProviderOptionsSchema, 'ProviderOptions') },
          },
        },
        responses: { 200: { description: 'Provider saved' } },
      },
    },
    // ── Council config ──────────────────────────────────────────────
    '/council/config': {
      get: {
        summary: "Get the user's council configuration (or 204 if none)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'CouncilConfig' }, 204: { description: 'No config' } },
      },
      put: {
        summary: 'Upsert council configuration',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': { schema: toRef(CouncilConfigSchema, 'CouncilConfigInput') },
          },
        },
        responses: {
          200: { description: 'Config saved' },
          400: { description: 'Validation error' },
        },
      },
      delete: {
        summary: 'Remove council configuration (revert to auto)',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Config removed' } },
      },
    },
  },
};

const outPath = resolve(__dirname, '..', 'openapi.json');
writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
// eslint-disable-next-line no-console -- CLI script: stdout is the intended output
console.log(`OpenAPI spec written to ${outPath} (${JSON.stringify(doc).length} bytes)`);
