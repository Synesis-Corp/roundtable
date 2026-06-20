# Roundtable

Full-stack TypeScript monorepo with React frontend, Node.js/Express API, and PostgreSQL persistence. Supports multiple AI providers with capability-based routing, Council-style multi-model deliberation, SSE streaming, JWT auth, Google Sign-In, encrypted API key storage, and OpenAI Codex/ChatGPT Plus OAuth.

## Architecture

```
apps/
  web/       React + Vite frontend
  api/       Express backend
packages/
  sdk/       Provider plugin interface & shared types
  providers/ OpenAI, Anthropic, Google, OpenAI-compatible adapters
  router/    Capability registry & orchestration engine
  db/        Prisma schema & client
  crypto/    AES-256-GCM encryption utilities
```

## Quick Start

### Docker (recommended)

```bash
docker compose up --build -d
```

- **Web** (SPA): http://localhost
- **API**: http://localhost/api (direct `:4000`)
- **PostgreSQL**: host `:5433` (internal `:5432`)

Stop: `docker compose down` (add `-v` to drop the DB volume).

### Native dev (no Docker)

```bash
pnpm install
cp .env.example .env  # edit with real secrets
DATABASE_URL='postgresql://user@localhost:5432/roundtable?schema=public' pnpm db:migrate:deploy
DATABASE_URL='postgresql://user@localhost:5432/roundtable?schema=public' pnpm dev
```

- Frontend: http://localhost:3000 (Vite with proxy to API)
- API: http://localhost:4000

Docker keeps the legacy default database name `chatia` unless `POSTGRES_DB` is set. That preserves existing local volumes after the Roundtable rebrand; fresh installs can set `POSTGRES_DB=roundtable`.

## Features

| Feature | Status |
|---------|--------|
| Single-provider chat (SSE streaming) | ✅ |
| **Council deliberation** (strong + light model per provider, consenso convergente) | ✅ |
| **Mixin synthesis** (all active chat models, capped at 8, parallel contributions + final synthesis) | ✅ |
| **Background stream resume** (generation survives navigation, re-attach via `/live`) | ✅ |
| **AI Usage dashboard** (input/output tokens, cost, charts; filtered by connected providers) | ✅ |
| JWT auth (email/password) + **refresh token (httpOnly cookie)** | ✅ |
| **Sign in with Google** | ✅ |
| Conversation management (**rename** + **AI re-title** + **soft delete**) | ✅ |
| Conversation search (Postgres FTS over titles + message content; ⌘K overlay) | ✅ |
| Encrypted API key storage (AES-256-GCM) | ✅ |
| OpenAI Codex / ChatGPT Plus OAuth | ✅ |
| Capability-based routing with fallbacks | ✅ |
| Rate limiting + input validation | ✅ |
| Health checks (`/health` + `/ready`) | ✅ |
| Graceful shutdown | ✅ |
| Structured logging (pino + pino-http) | ✅ |
| **Image attachments** (preview persisted in the conversation) | ✅ |
| **Reasoning / thinking** (collapsible block, when the model streams it) | ✅ |
| **Web search** (`web_search` tool offered to all providers; sources persisted + shown ChatGPT-style with favicons) | ✅ |
| Backend tests (380) + Frontend tests (288) + Packages (77: providers 30 + router 45 + crypto 2) | ✅ **745 total** |
| **Playwright E2E** in CI (docker-compose stack) | ✅ |
| Coverage (vitest v8) | ✅ (72% API, 50% Web) |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests (745: 380 backend + 288 frontend + 77 packages) |
| `pnpm coverage` | Coverage report (API ~72%, Web ~50%) |
| `pnpm test:e2e` | Playwright E2E (requires API running at :4000) |
| `pnpm docs:openapi` | Generate OpenAPI spec (`openapi.json`) |
| `pnpm lint` | ESLint (flat config) across the monorepo |
| `pnpm lint:fix` | ESLint with autofix |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check (no writes) |
| `pnpm db:push` | Apply Prisma schema to DB |
| `pnpm db:studio` | Open Prisma Studio |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32 chars for JWT signing (required) |
| `ENCRYPTION_SECRET` | Min 32 chars for AES-256-GCM |
| `ENCRYPTION_SALT` | Min 16 chars, scrypt salt (required) |
| `GOOGLE_CLIENT_ID` | OAuth client ID for Google Sign-In |
| `VITE_GOOGLE_CLIENT_ID` | Same ID, exposed to Vite at build time |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `WEB_URL` / `FRONTEND_URL` | CORS origins + OAuth redirect target |

The API validates all required vars at boot and aborts with a clear message if any is missing or too short.

**Important:** changing `ENCRYPTION_SECRET` or `ENCRYPTION_SALT` invalidates any
stored provider credentials encrypted with the previous values. If that happens,
users must reconnect those providers in Settings.

## Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness — process is up |
| `GET /ready` | Readiness — DB reachable (503 if not) |

## Authentication

### Email/Password

```
POST /auth/register  { email, password }  → { token, user }  (+ Set-Cookie: refreshToken)
POST /auth/login     { email, password }  → { token, user }  (+ Set-Cookie: refreshToken)
```

### Token model (access + refresh)

`token` is a short-lived **access JWT (15 min)** sent in the `Authorization: Bearer`
header. A long-lived **refresh token (7 days)** is delivered as an **httpOnly cookie**
(`refreshToken`, `SameSite=Strict`, `Path=/auth`, `Secure` in production). The raw
refresh token is never readable by JS and only its `sha256` is stored server-side.

```
POST /auth/refresh   (cookie)  → { token, user }   # rotates the refresh token
POST /auth/logout    (cookie)  → 204               # revokes it + clears the cookie
```

The web client sends requests with `credentials: "include"` and runs a single-flight
401 interceptor: on an expired access token it calls `/auth/refresh`, stores the new
access token, and replays the request once; if the refresh fails it clears the token
and redirects to login. Requires `cookie-parser` and CORS `credentials: true` (both set).

### Google Sign-In

```
1. User clicks "Continue with Google" → Google popup → returns ID token
2. POST /auth/google  { credential }  → { token, user }
```

First-time Google users get a new account automatically. Existing email+password accounts get their `googleId` linked on first Google sign-in (no password duplication).

To enable Google Sign-In you need a Client ID from Google Cloud Console (OAuth client ID, type "Web application", origins `http://localhost` and `http://localhost:3000`). Add it to `.env` as both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`. Docker Compose already has it pre-configured in the api environment and web build args.

## Chat Endpoints

### Single-provider (SSE streaming)

```
POST /chat/stream  { messages, conversationId?, model?, provider? }
→ SSE events: message.delta, message.done
```

### Council / Multi-model deliberation (SSE)

```
POST /chat/multi   { messages, conversationId?, preferences? }
→ SSE events: council.start, round.start, voice.proposal, vote.cast,
              council.decision, council.answer.delta, council.answer.done
```

The **Council mode** selects, for each connected provider, a **strong** and a **light** model whenever possible. Those models deliberate in 3 rounds:
1. **Proposals** — each model proposes an approach in structured markdown
2. **Debate** — models compare proposals and identify the best common base
3. **Vote** — each model votes for the strongest base and contributes one improvement
4. **Synthesis** — the final answer integrates the winning base plus the best improvements from the rest of the council

Results are persisted in `CouncilTurn` + `CouncilVoice` tables. The UI shows round progress, collapsible proposal details, provider logos, and a styled final synthesis. Image attachments are previewed inside the composer instead of above it.

### Mixin synthesis (SSE)

```
POST /chat/mixin  { messages, conversationId?, preferences: { mixinMode: true } }
→ SSE token stream plus persistence and background resume through the shared stream hub
```

**Mixin** is a third mode, separate from Single and Council. It runs all connected,
active, text-capable models in parallel (up to 8, ranked deterministically when the
user has more), then asks the leading successful model to synthesize one final answer.
It does not debate or vote. The composer shows the exact number of selected models and
warns that parallel calls can take longer and consume more tokens. It respects image/PDF
attachments, incognito, memory, conversation persistence, generated titles and usage
tracking.

### Council Members Configuration

Users can manually configure which models participate in Council mode via **Settings → Miembros del Consejo**. The modal shows all available models grouped by provider with checkboxes. Selections are persisted per-user in PostgreSQL (`CouncilConfig` table) and validated server-side:

- Minimum 2 models, maximum 8
- At least 2 different providers required
- All model IDs must exist in the current registry

If a saved configuration becomes invalid (e.g., a model is removed from the registry), the backend silently falls back to the automatic selection (`selectCouncilModels`) instead of failing. The composer dynamically shows the configured model count when a manual config is active.
