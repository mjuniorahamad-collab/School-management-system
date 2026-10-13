/**
 * Single source of truth for the local, non-synced PostgreSQL install.
 *
 * The user-space cluster used to live under `.data/postgres`, inside the
 * OneDrive-synced repository. OneDrive Files On-Demand repeatedly dehydrated the
 * binaries and data directory, and PostgreSQL backend processes died with
 * 0xC0000142 (STATUS_DLL_INIT_FAILED), taking the whole cluster down. The local
 * install now lives at C:\sms-pg, outside any synced folder. The old
 * `.data/postgres` cluster is retained untouched as a rollback copy.
 */

import { resolve } from "node:path"

/** Absolute, non-synced root for the local PostgreSQL binaries, data and log. */
export const PG_ROOT = "C:\\sms-pg"

export const PG_BIN = resolve(PG_ROOT, "pgsql", "bin")
export const PG_CTL = resolve(PG_BIN, "pg_ctl.exe")
export const PG_ISREADY = resolve(PG_BIN, "pg_isready.exe")
export const PG_DATA = resolve(PG_ROOT, "data")
export const PG_LOG = resolve(PG_ROOT, "pg.log")
export const PG_PORT = 5433
