/**
 * Neon Postgres 客户端封装 — Agent Runtime 版
 * ===========================================
 *
 * 与 cloud-functions/_db.ts 同根(都是 @neondatabase/serverless 的 HTTPS 模式),
 * 但独立放在 agents/ 下,确保 Agent 模块不依赖 cloud-functions 目录。
 *
 * 用途:阶段二链路里 "Agent 内部读 Neon 取业务数据也走 HTTPS" 的真实证据。
 * 每次 chat 调用时,Agent 用 JWT 里的 sub 拉一次用户 profile,作为 LLM 上下文。
 */

import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

function getSql(env: Record<string, string | undefined>) {
  if (_sql) return _sql;
  const url = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  _sql = neon(url);
  return _sql;
}

export interface UserProfile {
  id: string;
  username: string;
  created_at: string;
}

/**
 * 按 id 拉 user profile。返回 null 表示未找到(理论上 JWT 通过的话一定能找到,
 * 除非账号被删除 — 这种异常 case 我们不让 chat 崩,只是无 profile 上下文)。
 */
export async function readUserProfile(
  env: Record<string, string | undefined>,
  userId: string,
): Promise<UserProfile | null> {
  const sql = getSql(env);
  const rows = (await sql`
    SELECT id, username, created_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as UserProfile[];
  return rows[0] ?? null;
}
