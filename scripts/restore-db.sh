#!/usr/bin/env bash
#
# Restore a Roundtable Postgres backup produced by backup-db.sh.
#
# Usage: ./scripts/restore-db.sh backups/roundtable_YYYYMMDD_HHMMSS.sql.gz
#
# DESTRUCTIVE: overwrites the target database. Requires typing the DB name to
# confirm. The dump is created with --clean --if-exists, so it drops and
# recreates objects before loading data.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-roundtable-postgres}"
DB="${POSTGRES_DB:-chatia}"
DB_USER="${POSTGRES_USER:-postgres}"

file="${1:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

echo "WARNING: this overwrites database '$DB' in container '$CONTAINER' from:"
echo "  $file"
read -r -p "Type the database name ($DB) to confirm: " confirm
[[ "$confirm" == "$DB" ]] || {
  echo "Aborted."
  exit 1
}

gunzip -c "$file" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB"
echo "Restore complete from $file"
