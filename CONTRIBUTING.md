# Contributing to Roundtable

¡Gracias por contribuir! Este documento cubre todo lo que necesitás para
levantar el proyecto, hacer cambios y mandar un PR.

Al participar aceptás nuestro [Código de Conducta](CODE_OF_CONDUCT.md). Para
vulnerabilidades de seguridad, **no** abras un issue público: seguí
[SECURITY.md](SECURITY.md).

## Levantar el proyecto

### Docker (recomendado)

```bash
docker compose up --build -d
```

- **Web**: http://localhost
- **API**: http://localhost/api (directo `:4000`)
- **PostgreSQL**: host `:5433` (interno `:5432`)

El `entrypoint.sh` aplica las migraciones automáticamente. Para apagar:
`docker compose down` (agregá `-v` para tirar el volumen de la DB).

### Nativo (sin Docker)

```bash
pnpm install
cp .env.example .env   # editar con secrets reales
pnpm db:migrate:deploy
pnpm dev
```

- Frontend: http://localhost:3000 (Vite, proxy `/api` → `:4000`)
- API: http://localhost:4000

**Importante**: el `.env` de la raíz usa el host `postgres` (nombre del servicio
de docker). Para nativo necesitás `localhost` en `DATABASE_URL`. El `.env`
nunca se commitea — está en `.gitignore` y bloqueado por hooks.

## Convenciones

### Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): descripción corta
fix(scope): descripción corta
refactor(scope): descripción corta
chore(scope): descripción corta
docs(scope): descripción corta
test(scope): descripción corta
```

- **NO** uses `Co-Authored-By` ni atribución a IA.
- Commit messages en **español o inglés**, a elección del autor.
- La descripción va en **imperativo** ("agrega X", no "agregado X").

### Branches y PRs

- `main` = producción.
- Flujo: `feat/<nombre>` → PR → squash-merge a `main`.
- Push directo a `main` es libre, pero se recomienda pasar por PR.
- Force push a `main` está **bloqueado** (hook).

### Código

- **TypeScript strict mode** en todo el monorepo.
- **ESLint** (`pnpm lint`): 0 errores, 0 warnings. La config vive en
  `eslint.config.mjs` (flat config).
- **Prettier** (`pnpm format:check`): la config está lista; el reformat masivo
  del repo es decisión del equipo (no se corrió aún).
- La documentación se actualiza en la misma sesión (regla #1 de
  `OPERATING_RULES.md`). Si tocás arquitectura, flujo, env o CI, la doc queda
  sincronizada antes de cerrar la tarea.

## Cómo correr tests

```bash
pnpm test          # unitarios + integración (vitest, 295 tests)
pnpm lint          # ESLint flat config sobre todo el monorepo
pnpm coverage      # reporte de coverage (API ~72%, Web ~50%)
pnpm test:e2e      # Playwright E2E (requiere API corriendo en :4000)
pnpm build         # typecheck de todo el monorepo
```

Los tests de API mockean Prisma (`vi.mock("@chat/db")`) — no requieren base de
datos. Los tests E2E usan Playwright contra el stack completo; en local
necesitás la API corriendo, en CI lo levanta docker compose.

## Arquitectura

```
apps/
  web/       React 18 + Vite frontend
  api/       Express 4 backend
packages/
  sdk/       Provider plugin interface & shared types (Zod schemas)
  providers/ OpenAI, Anthropic, Google, OpenAI-compatible adapters
  router/    Capability registry & orchestration engine
  db/        Prisma schema & client
  crypto/    AES-256-GCM encryption utilities
  tsconfig/  Shared TypeScript configs
```

- **Monorepo**: pnpm workspaces + Turbo.
- **Base de datos**: PostgreSQL 16, migraciones versionadas con Prisma
  (`prisma migrate deploy`, nunca `db push` en prod).
- **Auth**: JWT access tokens (15 min) + refresh tokens en cookie httpOnly
  (7 días, con rotación).
- **Streaming**: SSE (`/chat/stream`, `/chat/multi`).
- **Council**: deliberación multi-modelo en 3 rondas (propuesta → debate →
  voto → síntesis), con selección strong+light por provider.

## Cómo agregar un nuevo provider

1. Creá un adaptador en `packages/providers/src/` que implemente
   `ProviderPlugin` de `@chat/sdk`:
   ```ts
   export class MyProvider implements ProviderPlugin {
     id = "my-provider";
     name = "My Provider";
     getCapabilities(): ModelCapability[] { ... }
     async chat(request: ChatRequest, apiKey: string, signal?: AbortSignal): Promise<ChatResponse> { ... }
   }
   ```
2. Registralo en `apps/api/src/lib/provider-registry.ts`.
3. Si usa el SDK de Vercel AI (`ai`), seguí el patrón de los adaptadores
   existentes (`openai.ts`, `anthropic.ts`, etc.).
4. Agregá tests en `packages/providers/src/providers.test.ts`.
5. Actualizá el README y este CONTRIBUTING.md si es necesario.

## Documentación

- `README.md` — descripción general, features y quick start.
- `rules/OPERATING_RULES.md` — reglas operativas del proyecto.
- `CODE_OF_CONDUCT.md` · `SECURITY.md` · `TRADEMARKS.md` — gobernanza.

## Firmá tus commits (DCO)

Usamos el **Developer Certificate of Origin**. Agregá la línea `Signed-off-by`
a cada commit (certifica que escribiste el código o tenés derecho a aportarlo):

```bash
git commit -s -m "feat: ..."
```

Esto agrega `Signed-off-by: Tu Nombre <vos@example.com>` usando tu `user.name` /
`user.email` de git.

## Licencia de las contribuciones

Roundtable está licenciado bajo la **GNU Affero General Public License v3.0**
(ver [LICENSE](LICENSE)). Al contribuir, aceptás que tu aporte se licencia bajo
los mismos términos AGPL-3.0. "Roundtable" y "r8e" son marcas de Synesis Corp
(ver [TRADEMARKS.md](TRADEMARKS.md)).
