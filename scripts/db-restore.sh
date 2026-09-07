#!/usr/bin/env bash
# Restores a School Management System database from a `pg_dump --format=custom`
# backup created by db-backup.sh.
#
# Reads DATABASE_URL from the environment, falling back to the root .env file
# (first non-comment line). Requires pg_restore on PATH. The password is passed
# only via PGPASSWORD and is never printed.
#
# Restore DESTROYS the current contents of the target database (--clean
# --if-exists). Pass --yes as the first argument to skip the confirmation.
#
# Usage:
#   ./scripts/db-restore.sh <backup.dump>    # prompts for confirmation
#   ./scripts/db-restore.sh --yes <backup.dump>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

YES=0
FILE="${1:-}"
if [ "$FILE" = "--yes" ]; then
  YES=1
  FILE="${2:-}"
fi

if [ -z "$FILE" ]; then
  echo "db-restore: usage: ./scripts/db-restore.sh [--yes] <backup.dump>" >&2
  exit 1
fi
[ -f "$FILE" ] || { echo "db-restore: backup file not found: $FILE" >&2; exit 1; }

resolve_env_value() {
  local name="$1"
  awk -F= -v k="$name" '/^[[:space:]]*[^#]/{gsub(/^[[:space:]]+/, "", $1); if ($1 == k) { sub(/^[^=]*=[[:space:]]*/, ""); gsub(/^"|"$/, "", $0); print; exit }}' "$ROOT/.env"
}

DB_URL_RAW="${DATABASE_URL:-$(resolve_env_value DATABASE_URL)}"
if [ -z "$DB_URL_RAW" ]; then
  echo "db-restore: DATABASE_URL is not set and no DATABASE_URL= line was found in .env" >&2
  exit 1
fi

case "$DB_URL_RAW" in
  postgresql://*|postgres://*) REST="${DB_URL_RAW#*://}" ;;
  *) echo "db-restore: DATABASE_URL must start with postgresql:// or postgres://" >&2; exit 1 ;;
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

[ -n "$DBNAME" ] || { echo "db-restore: DATABASE_URL has no database name" >&2; exit 1; }

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

if [ "$YES" -ne 1 ]; then
  echo "WARNING: this will DESTROY the current contents of '$DBNAME' on $HOST:$PORT" >&2
  echo "and replace it with: $FILE" >&2
  read -r -p "Type YES to confirm: " answer
  [ "$answer" = "YES" ] || { echo "Restore cancelled."; exit 0; }
fi

command -v pg_restore >/dev/null 2>&1 || { echo "db-restore: pg_restore not found on PATH (install PostgreSQL client tools)" >&2; exit 1; }

PREV_PG_PASSWORD="${PGPASSWORD:-}"
export PGPASSWORD="$PASSWORD"
cleanup() { PGPASSWORD="$PREV_PG_PASSWORD"; }
trap cleanup EXIT

if ! pg_restore --clean --if-exists --no-owner --no-privileges \
  --exit-on-error --host "$HOST" --port "$PORT" --username "$USER" \
  --dbname "$DBNAME" --file "$FILE"; then
  echo "db-restore: pg_restore failed" >&2
  exit 1
fi

echo "Restore complete: $FILE -> $DBNAME"