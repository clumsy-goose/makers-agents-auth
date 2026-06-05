/**
 * POST /auth/login — 用户登录
 * =============================
 *
 * Runtime: Node 20 (cloud-functions/nodejs)
 *
 * 方案一对应链路第 ④⑤⑥⑦ 步。
 * 登录失败统一返回 401 + 模糊原因(invalid_credentials),不暴露用户是否存在。
 */

import bcrypt from 'bcryptjs';
import { signJwt, serializeCookie } from '../../_jwt';
import { findUserByUsername } from '../../_db';
import { validateUsername, validatePassword } from '../../_validate';

const JWT_TTL_DEFAULT = 86400;
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

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'bad_request', reason: 'invalid json' }, 400);
  }

  // 输入校验放宽 — 只确保是字符串(避免直接抛 SQL)
  if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
    return jsonResponse({ error: 'bad_request', reason: 'username and password required' }, 400);
  }
  // 进一步格式校验 — 失败也只返回 invalid_credentials,不暴露原因
  const u = validateUsername(body.username);
  const p = validatePassword(body.password);
  if (!u.ok || !p.ok) {
    return jsonResponse({ error: 'invalid_credentials' }, 401);
  }

  const { username, password } = body;

  // 查询用户
  let user;
  try {
    user = await findUserByUsername(env, username);
  } catch (e) {
    return jsonResponse({ error: 'db_error', reason: (e as Error).message }, 500);
  }

  // 即使不存在也跑一次 bcrypt(防时序攻击,让响应时间稳定)
  const fakeHash = '$2a$10$abcdefghijklmnopqrstuv1234567890123456789012345678901';
  const hash = user?.password_hash ?? fakeHash;
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) {
    return jsonResponse({ error: 'invalid_credentials' }, 401);
  }

  // 签发 JWT
  const ttl = Number(env.JWT_TTL_SECONDS ?? JWT_TTL_DEFAULT);
  const token = signJwt({ sub: user.id, username: user.username }, secret, ttl);
  const cookie = serializeCookie('eo_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: ttl,
    domain: env.COOKIE_DOMAIN || undefined,
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
