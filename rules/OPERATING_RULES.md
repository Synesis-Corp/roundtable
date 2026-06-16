# OPERATING_RULES.md — Reglas operativas del proyecto

> Esta es la **fuente unica de verdad** de como se trabaja en este proyecto.
> Edita estas reglas con las tuyas. Todo lo demas (CLAUDE.md, AGENTS.md, opencode.json, etc.)
> **referencia** este archivo en vez de duplicar su contenido.

Aplican **siempre**: sin importar que agente AI (Claude Code, opencode, Cursor,
Gemini, Codex…) ni si el trabajo es backend, frontend, infra, datos o docs.

---

## 1. Documentacion al dia o la tarea NO esta terminada

Cada vez que se agregue, corrija o elimine algo relevante, se actualiza en la
misma sesion la documentacion afectada (README, docs de arquitectura, estado).
Si cambia arquitectura, flujo, entorno, CI/CD o configuracion, la doc queda
sincronizada antes de cerrar la tarea.

## 2. Verifica antes de afirmar

No se asume: se verifica con evidencia real (codigo, base de datos, logs,
procesos). La documentacion puede estar desactualizada; los hechos no. Si no
estas seguro, investiga antes de afirmar.

## 3. Branching

- `main` = produccion.
- Flujo simple: rama -> PR -> `main`.
- Push directo a `main` es libre (sin bloqueo), pero se recomienda pasar por PR.
- Force push a `main`/`master` **esta bloqueado** por el hook (override documentado).

## 4. Las variables de entorno son secretas

- `.env`, `.env.production` y equivalentes **no se commitean**.
- Versiona solo plantillas: `.env.example` / `.env.template`.
- Los secretos reales viven en el gestor de secretos / variables del entorno.

## 5. Un paso critico que puede fallar debe poder ABORTAR

Nada de `|| true` ni `|| echo "ok"` que convierten una falla en silencio.
Si un paso de CI/deploy/migracion falla, el proceso se detiene y es visible.

## 6. Cambios de infraestructura se documentan

Si tocas CI/CD, contenedores, proxy, infra como codigo o migraciones, deja la
documentacion y el rollback claros en la misma sesion.

## 7. Toda regla dura tiene una salida de emergencia documentada

Los hooks permiten overrides para emergencias reales, pero su uso debe quedar
registrado:

- `ALLOW_MAIN=1 git push …` — push directo a la rama protegida (cuando el bloqueo esta activo).
- `ALLOW_FORCE=1 git push --force …` — force push a `main`.
- `git commit --no-verify` — saltear validaciones de pre-commit.

## 8. Definicion de "terminado"

Una tarea no esta cerrada si falta cualquiera de estas piezas:

- [ ] Codigo correcto + pruebas/typecheck relevantes en verde
- [ ] Verificacion de runtime (health/smoke) si toco deploy
- [ ] Documentacion sincronizada con el estado real
- [ ] Rollback entendible (tag/imagen/commit estable identificable)

---

> Personaliza, agrega o quita reglas segun tu proyecto. Lo importante es que
> **vivan en un solo lugar** y que el enforcement (hooks) las respalde.
