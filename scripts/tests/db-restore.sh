#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESTORE="$ROOT/scripts/db-restore.sh"
BACKUP="$(mktemp)"
ARGS_FILE="$(mktemp)"
FAKE_BIN="$(mktemp -d)"
FAILURES=0

cat > "$FAKE_BIN/pg_restore" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$PG_RESTORE_ARGS_FILE"
exit 0
EOF
chmod +x "$FAKE_BIN/pg_restore"

cleanup() {
  rm -f "$BACKUP" "$ARGS_FILE"
  rm -rf "$FAKE_BIN"
  unset DATABASE_URL RESTORE_DATABASE_URL MIGRATION_DATABASE_URL PG_RESTORE_ARGS_FILE || true
}
trap cleanup EXIT

run_restore() {
  set +e
  OUTPUT="$("$RESTORE" "$@" 2>&1)"
  STATUS=$?
  set -e
}

assert_case() {
  local name="$1" expected="$2" pattern="$3"
  if [ "$STATUS" -ne "$expected" ]; then
    echo "FAIL $name: expected exit $expected, got $STATUS"
    echo "$OUTPUT"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if [ -n "$pattern" ] && ! grep -Eq "$pattern" <<< "$OUTPUT"; then
    echo "FAIL $name: output did not match '$pattern'"
    echo "$OUTPUT"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if grep -q "secret-password" <<< "$OUTPUT"; then
    echo "FAIL $name: output leaked a password"
    FAILURES=$((FAILURES + 1))
    return
  fi
  echo "PASS $name"
}

unset DATABASE_URL RESTORE_DATABASE_URL MIGRATION_DATABASE_URL || true
run_restore "$BACKUP" --validate-only
assert_case "missing DATABASE_URL" 1 "DATABASE_URL is not set"

export DATABASE_URL="postgresql://school:secret-password@127.0.0.1:5433"
run_restore "$BACKUP" --validate-only \
  --confirm-host 127.0.0.1 --confirm-port 5433 --confirm-database school_management
assert_case "missing database name" 1 "has no database name"

export DATABASE_URL="postgresql://school:secret-password@/school_management"
run_restore "$BACKUP" --validate-only
assert_case "empty host" 1 "has no host"

export DATABASE_URL="postgresql://school:secret-password@127.0.0.1:5433/school_management"
run_restore "$BACKUP" --validate-only \
  --confirm-host 127.0.0.1 --confirm-port 5433 --confirm-database school_management
assert_case "local validate-only" 0 "Validation complete"

run_restore "$BACKUP" --validate-only \
  --confirm-host localhost --confirm-port 5433 --confirm-database school_management
assert_case "wrong host" 1 "does not match"

run_restore "$BACKUP" --validate-only \
  --confirm-host 127.0.0.1 --confirm-port 5432 --confirm-database school_management
assert_case "wrong port" 1 "does not match"

run_restore "$BACKUP" --validate-only \
  --confirm-host 127.0.0.1 --confirm-port 5433 --confirm-database other_database
assert_case "wrong database" 1 "does not match"

run_restore "$BACKUP" --validate-only
assert_case "missing confirmations" 1 "non-interactive restore requires"

export DATABASE_URL="postgresql://school:secret-password@[::1]:5433/school_management"
run_restore "$BACKUP" --validate-only \
  --confirm-host ::1 --confirm-port 5433 --confirm-database school_management
assert_case "bracketed IPv6" 0 "Validation complete"

export DATABASE_URL="postgresql:///school_management?host=/var/run/postgresql"
run_restore "$BACKUP" --validate-only \
  --confirm-host /var/run/postgresql --confirm-port 5432 --confirm-database school_management
assert_case "socket host query parameter" 0 "Validation complete"

unset RESTORE_DATABASE_URL || true
export DATABASE_URL="postgresql://school:secret-password@ep-quiet-lab-pooler.neon.tech/neondb"
run_restore "$BACKUP" --validate-only \
  --confirm-host ep-quiet-lab.neon.tech --confirm-port 5432 --confirm-database neondb
assert_case "pooled without direct URL" 1 "RESTORE_DATABASE_URL"

export RESTORE_DATABASE_URL="postgresql://school:secret-password@ep-quiet-lab.neon.tech/neondb"
run_restore "$BACKUP" --validate-only \
  --confirm-host ep-quiet-lab.neon.tech --confirm-port 5432 --confirm-database neondb
assert_case "pooled with equivalent direct URL" 0 "Validation complete"

export RESTORE_DATABASE_URL="postgresql://school:secret-password@ep-quiet-lab.neon.tech/other"
run_restore "$BACKUP" --validate-only \
  --confirm-host ep-quiet-lab.neon.tech --confirm-port 5432 --confirm-database neondb
assert_case "pooled with different database" 1 "does not name the same database"

export PATH="$FAKE_BIN:$PATH"
export PG_RESTORE_ARGS_FILE="$ARGS_FILE"
export DATABASE_URL="postgresql://school:secret-password@127.0.0.1:5433/school_management"
run_restore "$BACKUP" --yes \
  --confirm-host 127.0.0.1 --confirm-port 5433 --confirm-database school_management
assert_case "local restore invocation" 0 "Restore complete"
for required in "--single-transaction" "--exit-on-error" "--dbname" "$BACKUP"; do
  if ! grep -qx -- "$required" "$ARGS_FILE"; then
    echo "FAIL local restore invocation: missing argument '$required'"
    FAILURES=$((FAILURES + 1))
  fi
done
if grep -qx -- "--file" "$ARGS_FILE"; then
  echo "FAIL local restore invocation: invalid --file input option was passed to pg_restore"
  FAILURES=$((FAILURES + 1))
fi
if grep -q "secret-password" "$ARGS_FILE"; then
  echo "FAIL local restore invocation: password was passed in pg_restore arguments"
  FAILURES=$((FAILURES + 1))
fi

export DATABASE_URL="postgresql://school:secret-password@[::1]:5433/school_management"
run_restore "$BACKUP" --yes \
  --confirm-host ::1 --confirm-port 5433 --confirm-database school_management
assert_case "IPv6 restore invocation" 0 "Restore complete"
if ! grep -Fxq -- "::1" "$ARGS_FILE"; then
  echo "FAIL IPv6 restore invocation: pg_restore did not receive the canonical IPv6 host"
  FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -ne 0 ]; then
  echo "$FAILURES db-restore.sh behavior test(s) failed" >&2
  exit 1
fi
echo "All db-restore.sh behavior tests passed"
