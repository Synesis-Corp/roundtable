#!/bin/sh
# ============================================================================
# entrypoint.sh — API container entrypoint
# ============================================================================
# 1. Optionally wait for PostgreSQL to be ready.
# 2. Run Prisma migrations.
# 3. Start the API server.
# ============================================================================

set -e

# ---------------------------------------------------------------------------
# Wait for PostgreSQL (optional, best-effort)
# ---------------------------------------------------------------------------
if [ -n "$DATABASE_URL" ]; then
    # Extract host from DATABASE_URL
    # Expected format: postgresql://user:pass@host:port/db?...
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:/]*\).*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*@[^:]*:\([0-9]*\).*/\1/p')
    DB_PORT="${DB_PORT:-5432}"

    echo "[entrypoint] Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

    # Wait up to 30 seconds for PostgreSQL to accept connections
    for i in $(seq 1 30); do
        if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
            echo "[entrypoint] PostgreSQL is ready."
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "[entrypoint] WARNING: PostgreSQL did not become ready in time. Continuing anyway..."
        else
            sleep 1
        fi
    done
else
    echo "[entrypoint] DATABASE_URL not set — skipping PostgreSQL wait."
fi

# ---------------------------------------------------------------------------
# Apply versioned migrations (prisma migrate deploy)
# ---------------------------------------------------------------------------
# Migration history lives in packages/db/prisma/migrations/. `migrate deploy`
# applies pending migrations in order and NEVER resets data (safe for prod).
#
# Adoption of an existing db-push DB: a DB created with the old `db push` has
# tables but no `_prisma_migrations` history, so `migrate deploy` aborts with
# P3005 ("database schema is not empty"). We detect that one-time case and
# baseline it (mark 0_init as already applied), then deploy continues normally.
# A real migration error still aborts the boot (regla #5: nunca silenciar fallas).
echo "[entrypoint] Running database migrations (prisma migrate deploy)..."
cd /app/packages/db

if ! npx prisma migrate deploy 2>/tmp/migrate_err.log; then
    if grep -q "P3005" /tmp/migrate_err.log; then
        echo "[entrypoint] Existing non-empty DB detected — baselining migration history (0_init)..."
        npx prisma migrate resolve --applied 0_init
        echo "[entrypoint] Re-running prisma migrate deploy after baseline..."
        npx prisma migrate deploy
    elif grep -q "P3018\|P3009" /tmp/migrate_err.log; then
        echo "[entrypoint] Detected partially failed initial migration (0_init) on an existing DB — repairing migration history..."
        npx prisma migrate resolve --rolled-back 0_init
        npx prisma migrate resolve --applied 0_init
        echo "[entrypoint] Re-running prisma migrate deploy after repairing migration history..."
        npx prisma migrate deploy
    else
        echo "[entrypoint] FATAL: migration failed:" >&2
        cat /tmp/migrate_err.log >&2
        exit 1
    fi
fi

echo "[entrypoint] Generating Prisma Client..."
npx prisma generate

# ---------------------------------------------------------------------------
# Start the API server
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting API server..."
cd /app/apps/api
exec node dist/index.js
