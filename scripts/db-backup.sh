#!/usr/bin/env bash
# Backs up the School Management System PostgreSQL database to a timestamped
# custom-format dump and prunes old backups.
#
# Reads DATABASE_URL from the environment, falling back to the root .env file
# (first non-comment line). Requires pg_dump on PATH. The password is passed
# only via PGPASSWORD to the pg_dump child process and is never printed.
#
# Usage:
#   ./scripts/db-backup.sh [OUTPUT_DIR] [RETAIN]
#   OUT_DIR defaults to ./backups, RETAIN defaults to 14.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"
RETAIN="${2:-14}"

resolve_env_value() {
  local name="$1"
  awk -F= -v k="$name" '/^[[:space:]]*[^#]/{gsub(/^[[:space:]]+/, "", $1); if ($1 == k) { sub(/^[^=]*=[[:space:]]*/, ""); gsub(/^"|"$/, "", $0); print; exit }}' "$ROOT/.env"
}

DB_URL_RAW="${DATABASE_URL:-$(resolve_env_value DATABASE_URL)}"
if [ -z "$DB_URL_RAW" ]; then
  echo "db-backup: DATABASE_URL is not set and no DATABASE_URL= line was found in .env" >&2
  exit 1
fi

case "$DB_URL_RAW" in
  postgresql://*|postgres://*) REST="${DB_URL_RAW#*://}" ;;
  *) echo "db-backup: DATABASE_URL must start with postgresql:// or postgres://" >&2; exit 1 ;;
esac

AUTH=""
if [[ "$REST" == *"@"* ]]; then
  AUTH="${REST%@*}"
  HOSTPART="${REST##*@}"
else
  HOSTPART="$REST"
fi

USER=""
PASSWORD=""
if [ -n "$AUTH" ]; then
  if [[ "$AUTH" == *:* ]]; then
    USER="${AUTH%%:*}"
    PASSWORD="${AUTH#*:}"
  else
    USER="$AUTH"
  fi
fi

HOSTPORT="${HOSTPART%%/*}"
DBNAME="${HOSTPART#*/}"
DBNAME="${DBNAME%%\?*}"
HOST="$HOSTPORT"
PORT="5432"
if [[ "$HOSTPORT" == *:* ]] && [[ "$HOSTPORT" != *"["* ]]; then
  HOST="${HOSTPORT%%:*}"
  PORT="${HOSTPORT##*:}"
fi

[ -n "$DBNAME" ] || { echo "db-backup: DATABASE_URL has no database name" >&2; exit 1; }

# URL-decode individual components (e.g. %40 -> @, %3A -> :). Pure bash +
# printf byte decoding; no external language runtime required.
urldecode() {
  local s="$1" out="" hex="" i=0
  while [ "$i" -lt "${#s}" ]; do
    local c="${s:i:1}"
    if [ "$c" = "%" ] && [ "$i" -le $((${#s} - 3)) ]; then
      hex="${s:i+1:2}"
      out+="$(printf "\\x%s" "$hex")"
      i=$((i + 3))
    else
      out+="$c"
      i=$((i + 1))
    fi
  done
  printf "%s" "$out"
}
USER="$(urldecode "$USER")"
PASSWORD="$(urldecode "$PASSWORD")"
DBNAME="$(urldecode "$DBNAME")"

command -v pg_dump >/dev/null 2>&1 || { echo "db-backup: pg_dump not found on PATH (install PostgreSQL client tools)" >&2; exit 1; }

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/school-management-${DBNAME}-${STAMP}.dump"

PREV_PG_PASSWORD="${PGPASSWORD:-}"
export PGPASSWORD="$PASSWORD"
cleanup() { PGPASSWORD="$PREV_PG_PASSWORD"; }
trap cleanup EXIT

# shellcheck disable=SC2086
if ! pg_dump --format=custom --no-owner --no-privileges \
  --host "$HOST" --port "$PORT" --username "$USER" \
  --dbname "$DBNAME" --file "$FILE"; then
  rm -f "$FILE"
  echo "db-backup: pg_dump failed" >&2
  exit 1
fi

echo "Backup written: $FILE ($(du -k "$FILE" | cut -f1) KB)"

# Retention: keep the newest $RETAIN dumps for this database.
mapfile -t PRUNE < <(find "$OUT_DIR" -maxdepth 1 -type f -name "school-management-${DBNAME}-*.dump" -printf '%f\n' | sort -r | tail -n +"$((RETAIN + 1))")
for old in "${PRUNE[@]:-}"; do
  rm -f "$OUT_DIR/$old"
  echo "Pruned: $old"
done