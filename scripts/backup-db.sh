#!/usr/bin/env bash
#
# Postgres backup for the Roundtable stack.
#
# Dumps the compose `postgres` service to a timestamped, gzipped SQL file and
# prunes dumps older than the retention window. Manual use or via cron — see
# docs/BACKUPS.md.
#
# Rule #5 (OPERATING_RULES): a failing critical step must ABORT, never go
# silent. `set -euo pipefail` makes a failed pg_dump fail the whole script
# (pipefail catches it even though it is piped into gzip).
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-roundtable-postgres}"
DB="${POSTGRES_DB:-chatia}"
DB_USER="${POSTGRES_USER:-postgres}"
OUT_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$OUT_DIR"
ts="$(date +%Y%m%d_%H%M%S)"
out="$OUT_DIR/roundtable_${ts}.sql.gz"

echo "Backing up '$DB' from container '$CONTAINER' -> $out"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" --clean --if-exists \
  | gzip >"$out"

echo "Backup complete: $out ($(du -h "$out" | cut -f1))"

# Prune dumps older than the retention window.
find "$OUT_DIR" -name 'roundtable_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete
echo "Pruned backups older than ${RETENTION_DAYS} days in $OUT_DIR."
