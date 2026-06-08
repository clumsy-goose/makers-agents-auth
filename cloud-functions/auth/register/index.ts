/**
 * POST /auth/register — 用户注册
 * ================================
 *
 * Runtime: Node 20 (cloud-functions/nodejs)
 *
 * 方案一对应链路第 ④⑤⑥⑦ 步:
 *   ④ cf 通过 @neondatabase/serverless 标签模板 SQL 查询 users
 *   ⑤ 用户已存在 → 409
 *   ⑥ bcrypt 哈希 + INSERT + node:crypto 签 JWT
 *   ⑦ Set-Cookie HttpOnly Secure SameSite=Lax + 200
 */

import bcrypt from 'bcryptjs';
import { signJwt, serializeCookie, JWT_TTL_SECONDS } from '../../_jwt';
import { findUserByUsername, createUser } from '../../_db';
import { validateUsername, validatePassword } from '../../_validate';

const BCRYPT_COST = 10;       // 平衡安全与冷启动延迟

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export async function onRequestPost(context: any): Promise<Response> {
  const env = (context.env ?? {}) as Record<string, string | undefined>;
  const secret = env.JWT_SECRET;
  if (!secret) {
    return jsonResponse({ error: 'server_misconfigured', reason: 'JWT_SECRET missing' }, 500);
  }

  // 1) 解析请求体
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'bad_request', reason: 'invalid json' }, 400);
  }

  // 2) 校验输入
  const u = validateUsername(body?.username);
  if (!u.ok) return jsonResponse({ error: 'invalid_username', reason: u.reason }, 400);

  const p = validatePassword(body?.password);
  if (!p.ok) return jsonResponse({ error: 'invalid_password', reason: p.reason }, 400);

  const username: string = body.username;
  const password: string = body.password;

  // 3) 查重
  try {
    const existing = await findUserByUsername(env, username);
    if (existing) {
      return jsonResponse({ error: 'username_taken' }, 409);
    }
  } catch (e) {
    return jsonResponse({ error: 'db_error', reason: (e as Error).message }, 500);
  }

  // 4) 哈希 + 落库
  let user;
  try {
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    user = await createUser(env, username, hash);
  } catch (e) {
    return jsonResponse({ error: 'register_failed', reason: (e as Error).message }, 500);
  }

  // 5) 签发 JWT 并写入 Cookie
  const token = signJwt({ sub: user.id, username: user.username }, secret);
  const cookie = serializeCookie('jwt_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: JWT_TTL_SECONDS,
  });

  return jsonResponse(
    {
      ok: true,
      user: { id: user.id, username: user.username },
    },
    200,
    { 'Set-Cookie': cookie },
  );
}
