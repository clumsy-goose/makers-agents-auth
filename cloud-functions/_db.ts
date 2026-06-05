/**
 * Neon Postgres 客户端封装(HTTPS 模式)
 * ======================================
 *
 * 通过 `@neondatabase/serverless` 的 `neon()` 工厂创建 SQL 标签模板。
 * 标签模板 sql`...${value}...` 会**自动参数化**,防 SQL 注入。
 *
 * 部署要求:
 *   - 在 Neon 控制台创建数据库,复制 "HTTP" 连接串(以 `postgresql://...` 开头)
 *   - EdgeOne 控制台环境变量配置 DATABASE_URL=...
 *   - 本地 dev 时写入 .env(已被 .gitignore 忽略)
 *
 * 注意:HTTP 模式不支持事务,但本项目的鉴权场景(单条 INSERT / SELECT)无需事务。
 * 如未来需要事务,可改用 `Pool` (WS) — cf 是 Node Runtime 完全支持。
 */

import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

/**
 * 取出共享的 sql 实例。第一次调用时初始化。
 * 不要在模块顶部初始化,避免 cold start 时 env 还未就绪。
 */
export function getSql(env: Record<string, string | undefined>) {
  if (_sql) return _sql;
  const url = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  _sql = neon(url);
  return _sql;
}

// ── 业务模型 ──────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

/** 大小写不敏感查找 — 与 0001_users.sql 中的 LOWER(username) 唯一索引匹配 */
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
