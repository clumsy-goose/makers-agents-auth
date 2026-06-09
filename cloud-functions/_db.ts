/**
 * Neon Postgres client (HTTPS mode)
 * ======================================
 *
 * Built on `@neondatabase/serverless`'s `neon()` SQL tag-template factory.
 * The tag-template form `sql`...${value}...` parameterises automatically —
 * it cannot be SQL-injected.
 *
 * Deployment requirements:
 *   - Create a Neon database, copy the "HTTP" connection string
 *     (starts with `postgresql://...`)
 *   - Set DATABASE_URL=... in the EdgeOne console env
 *   - For local dev: put it in .env (gitignored)
 *
 * Note: HTTP mode does not support transactions. The auth flows here
 * (one INSERT or SELECT per request) don't need them. Switch to `Pool`
 * (WS) if transactions become necessary — Node runtime supports it.
 */

import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

/**
 * Lazy-init the shared sql instance. Initialising at module top-level can
 * fail on cold-start before env vars are wired up.
 */
export function getSql(env: Record<string, string | undefined>) {
  if (_sql) return _sql;
  const url = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  _sql = neon(url);
  return _sql;
}

// ── Domain models ────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

/** Case-insensitive lookup — matches the LOWER(username) unique index in 0001_users.sql. */
export async function findUserByUsername(
  env: Record<string, string | undefined>,
  username: string,
): Promise<UserRow | null> {
  const sql = getSql(env);
  const rows = (await sql`
    SELECT id, username, password_hash, created_at
    FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function createUser(
  env: Record<string, string | undefined>,
  username: string,
  passwordHash: string,
): Promise<UserRow> {
  const sql = getSql(env);
  const rows = (await sql`
    INSERT INTO users (username, password_hash)
    VALUES (${username}, ${passwordHash})
    RETURNING id, username, password_hash, created_at
  `) as UserRow[];
  return rows[0];
}
