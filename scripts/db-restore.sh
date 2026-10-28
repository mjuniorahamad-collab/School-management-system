#!/usr/bin/env bash
# Restores a School Management System database from a `pg_dump --format=custom`
# backup created by db-backup.sh.
#
# Reads DATABASE_URL from the environment. There is no `.env` fallback. Requires
# pg_restore on PATH. The password is passed only via PGPASSWORD and is never
# printed.
#
# Restore DESTROYS the current contents of the target database (--clean
# --if-exists --single-transaction). The exact target identity must be supplied
# with --confirm-host, --confirm-port and --confirm-database. --yes only skips
# the final destructive prompt; it never replaces the identity confirmations.
# Non-interactive runs require --yes plus all three identity confirmations.
#
# If DATABASE_URL is pooled, RESTORE_DATABASE_URL must supply the direct,
# unpooled URL for the same database.
#
# Usage:
#   ./scripts/db-restore.sh <backup.dump> \
#     --confirm-host ep-example.neon.tech --confirm-port 5432 \
#     --confirm-database neondb --yes
#   ./scripts/db-restore.sh <backup.dump> ... --validate-only
set -euo pipefail

YES=0
VALIDATE_ONLY=0
FILE=""
CONFIRM_HOST=""
CONFIRM_PORT=""
CONFIRM_DATABASE=""
CONFIRM_HOST_SET=0
CONFIRM_PORT_SET=0
CONFIRM_DATABASE_SET=0

die() {
  echo "db-restore: $*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes)
      YES=1
      ;;
    --validate-only)
      VALIDATE_ONLY=1
      ;;
    --confirm-host)
      [ "$#" -ge 2 ] || die "--confirm-host requires a value"
      CONFIRM_HOST="$2"
      CONFIRM_HOST_SET=1
      shift
      ;;
    --confirm-host=*)
      CONFIRM_HOST="${1#*=}"
      CONFIRM_HOST_SET=1
      ;;
    --confirm-port)
      [ "$#" -ge 2 ] || die "--confirm-port requires a value"
      CONFIRM_PORT="$2"
      CONFIRM_PORT_SET=1
      shift
      ;;
    --confirm-port=*)
      CONFIRM_PORT="${1#*=}"
      CONFIRM_PORT_SET=1
      ;;
    --confirm-database)
      [ "$#" -ge 2 ] || die "--confirm-database requires a value"
      CONFIRM_DATABASE="$2"
      CONFIRM_DATABASE_SET=1
      shift
      ;;
    --confirm-database=*)
      CONFIRM_DATABASE="${1#*=}"
      CONFIRM_DATABASE_SET=1
      ;;
    --*)
      die "unknown argument: $1"
      ;;
    *)
      [ -z "$FILE" ] || die "only one backup file may be supplied"
      FILE="$1"
      ;;
  esac
  shift
done

[ -n "$FILE" ] || die "usage: ./scripts/db-restore.sh [options] <backup.dump>"
[ -f "$FILE" ] || die "backup file not found: $FILE"

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

canonical_host() {
  local host_value="${1,,}"
  if [ -z "$host_value" ]; then printf ""; return; fi
  if [[ "$host_value" =~ ^[0-9a-f:]+$ ]]; then printf "%s" "$host_value"; return; fi
  if [[ "$host_value" != *"pooler"* ]]; then printf "%s" "$host_value"; return; fi

  [[ "$host_value" == *.neon.tech ]] || die "unsupported pooled database host"
  local first="${host_value%%.*}"
  [[ "$first" == ep-*-pooler ]] || die "ambiguous Neon pooled database host"
  local direct_first="${first%-pooler}"
  [[ "$direct_first" == ep-?* ]] || die "ambiguous Neon pooled database host"
  local rest="${host_value#*.}"
  if [[ "$direct_first" == *"pooler"* || "$rest" == *"pooler"* ]]; then
    die "ambiguous Neon pooled database host"
  fi
  printf "%s.%s" "$direct_first" "$rest"
}

parse_url() {
  local raw="$1" label="$2"
  case "$raw" in
    postgresql://*|postgres://*) REST="${raw#*://}" ;;
    *) die "$label must start with postgresql:// or postgres://" ;;
  esac

  local auth="" hostpart="$REST"
  if [[ "$REST" == *"@"* ]]; then
    auth="${REST%@*}"
    hostpart="${REST##*@}"
  fi

  PARSE_USER=""
  PARSE_PASSWORD=""
  if [ -n "$auth" ]; then
    if [[ "$auth" == *:* ]]; then
      PARSE_USER="${auth%%:*}"
      PARSE_PASSWORD="${auth#*:}"
    else
      PARSE_USER="$auth"
    fi
  fi

  local query=""
  if [[ "$hostpart" == *"?"* ]]; then
    query="${hostpart#*\?}"
    hostpart="${hostpart%%\?*}"
  fi

  [[ "$hostpart" == */* ]] || die "$label has no database name"
  local hostport="${hostpart%%/*}"
  local database="${hostpart#*/}"
  [ -n "$database" ] || die "$label has no database name"

  PARSE_HOST="$hostport"
  PARSE_PORT="5432"
  if [[ "$hostport" == \[*\]* ]]; then
    PARSE_HOST="${hostport#\[}"
    PARSE_HOST="${PARSE_HOST%%\]*}"
    local after_host=""
    if [[ "${hostport#*\]}" == :* ]]; then
      after_host="${hostport#*\]}"
      PARSE_PORT="${after_host#:}"
      [ -n "$PARSE_PORT" ] || die "$label has an invalid port"
    else
      after_host="${hostport#*\]}"
      [ -z "$after_host" ] || die "$label has an invalid host"
    fi
    [ -n "$PARSE_HOST" ] || die "$label has no host"
  elif [[ "$hostport" == *:* ]]; then
    PARSE_HOST="${hostport%%:*}"
    PARSE_PORT="${hostport##*:}"
    [ -n "$PARSE_HOST" ] || die "$label has an invalid host"
    [ -n "$PARSE_PORT" ] || die "$label has an invalid port"
  fi

  local host_param=""
  local pgbouncer=""
  local pair key value
  IFS='&' read -r -a pairs <<< "$query"
  for pair in "${pairs[@]:-}"; do
    [ -n "$pair" ] || continue
    key="${pair%%=*}"
    value=""
    [[ "$pair" == *"="* ]] && value="${pair#*=}"
    key="$(urldecode "$key")"
    value="$(urldecode "$value")"
    case "$key" in
      host) host_param="$value" ;;
      pgbouncer) pgbouncer="${value,,}" ;;
    esac
  done
  [ -n "$PARSE_HOST" ] || PARSE_HOST="$host_param"
  [ -n "$PARSE_HOST" ] || die "$label has no host (or a socket host query parameter)"

  PARSE_DATABASE="$(urldecode "$database")"
  [ -n "$PARSE_DATABASE" ] || die "$label has no database name"
  PARSE_USER="$(urldecode "$PARSE_USER")"
  PARSE_PASSWORD="$(urldecode "$PARSE_PASSWORD")"

  PARSE_POOLED=0
  if [[ "$PARSE_HOST" == *"pooler"* ]]; then PARSE_POOLED=1; fi
  case "$pgbouncer" in 1|true|yes) PARSE_POOLED=1 ;; esac
}

DB_URL_RAW="${DATABASE_URL:-}"
[ -n "$DB_URL_RAW" ] || die "DATABASE_URL is not set. The restore script does not read .env."

parse_url "$DB_URL_RAW" "DATABASE_URL"
APP_HOST="$PARSE_HOST"
APP_PORT="$PARSE_PORT"
APP_DATABASE="$PARSE_DATABASE"
APP_POOLED="$PARSE_POOLED"
APP_CANONICAL="$(canonical_host "$APP_HOST")"

TARGET_HOST="$APP_HOST"
TARGET_PORT="$APP_PORT"
TARGET_DATABASE="$APP_DATABASE"
TARGET_USER="$PARSE_USER"
TARGET_PASSWORD="$PARSE_PASSWORD"
TARGET_CANONICAL="$APP_CANONICAL"

if [ "$APP_POOLED" -eq 1 ]; then
  RESTORE_URL_RAW="${RESTORE_DATABASE_URL:-}"
  [ -n "$RESTORE_URL_RAW" ] || die "DATABASE_URL uses a pooled endpoint; set RESTORE_DATABASE_URL to the direct, unpooled URL for the same database."
  parse_url "$RESTORE_URL_RAW" "RESTORE_DATABASE_URL"
  [ "$PARSE_POOLED" -eq 0 ] || die "RESTORE_DATABASE_URL must use a direct, unpooled endpoint."
  TARGET_HOST="$PARSE_HOST"
  TARGET_PORT="$PARSE_PORT"
  TARGET_DATABASE="$PARSE_DATABASE"
  TARGET_USER="$PARSE_USER"
  TARGET_PASSWORD="$PARSE_PASSWORD"
  TARGET_CANONICAL="$(canonical_host "$TARGET_HOST")"
  [ "$TARGET_CANONICAL" = "$APP_CANONICAL" ] || die "RESTORE_DATABASE_URL does not name the same host as DATABASE_URL"
  [ "$TARGET_PORT" = "$APP_PORT" ] || die "RESTORE_DATABASE_URL does not name the same port as DATABASE_URL"
  [ "${TARGET_DATABASE,,}" = "${APP_DATABASE,,}" ] || die "RESTORE_DATABASE_URL does not name the same database as DATABASE_URL"
fi

if [ "$CONFIRM_HOST_SET" -eq 0 ]; then
  [ -t 0 ] || die "non-interactive restore requires --confirm-host"
  read -r -p "Confirm target host ($TARGET_CANONICAL): " CONFIRM_HOST
fi
if [ "$CONFIRM_PORT_SET" -eq 0 ]; then
  [ -t 0 ] || die "non-interactive restore requires --confirm-port"
  read -r -p "Confirm target port ($TARGET_PORT): " CONFIRM_PORT
fi
if [ "$CONFIRM_DATABASE_SET" -eq 0 ]; then
  [ -t 0 ] || die "non-interactive restore requires --confirm-database"
  read -r -p "Confirm target database ($TARGET_DATABASE): " CONFIRM_DATABASE
fi

[ "${CONFIRM_HOST,,}" = "$TARGET_CANONICAL" ] || die "the confirmation host does not match the target"
[ "$CONFIRM_PORT" = "$TARGET_PORT" ] || die "the confirmation port does not match the target"
[ "${CONFIRM_DATABASE,,}" = "${TARGET_DATABASE,,}" ] || die "the confirmation database does not match the target"

if [ "$VALIDATE_ONLY" -eq 1 ]; then
  echo "Validation complete: $FILE -> $TARGET_DATABASE on $TARGET_CANONICAL:$TARGET_PORT"
  exit 0
fi

if [ "$YES" -ne 1 ]; then
  [ -t 0 ] || die "non-interactive restore requires --yes after the target identity confirmations"
  echo "WARNING: this will DESTROY the current contents of '$TARGET_DATABASE' on $TARGET_CANONICAL:$TARGET_PORT" >&2
  echo "and replace it with: $FILE" >&2
  read -r -p "Type YES to confirm: " answer
  [ "$answer" = "YES" ] || { echo "Restore cancelled."; exit 0; }
fi

command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found on PATH (install PostgreSQL client tools)"

PG_ARGS=(--clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction --port "$TARGET_PORT" --dbname "$TARGET_DATABASE" "$FILE")
[ -z "$TARGET_CANONICAL" ] || PG_ARGS=(--host "$TARGET_CANONICAL" "${PG_ARGS[@]}")
[ -z "$TARGET_USER" ] || PG_ARGS=(--username "$TARGET_USER" "${PG_ARGS[@]}")

PREV_PG_PASSWORD="${PGPASSWORD:-}"
export PGPASSWORD="$TARGET_PASSWORD"
cleanup() { PGPASSWORD="$PREV_PG_PASSWORD"; }
trap cleanup EXIT

if ! pg_restore "${PG_ARGS[@]}"; then
  echo "db-restore: pg_restore failed" >&2
  exit 1
fi

echo "Restore complete: $FILE -> $TARGET_DATABASE"
