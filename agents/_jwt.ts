/**
 * JWT (HS256) — Agent Runtime 版
 * ================================
 * 与 cloud-functions/_jwt.ts 字节级一致 — Agent 必须**独立**完成验签,
 * 不依赖任何 mw / cf 写下来的 header,这是双层防御铁律
 * (防止跳过 mw 直连 Agent 路径绕过鉴权)。
 *
 * 注意:Agent Runtime 中 context.request.headers 是 `Record<string, string>`
 * 纯对象(由 runtime 归一化为小写 key),与 cf 的 Headers 实例不同。
 * readCookie() 已兼容两种形态。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALG = 'HS256';
const TYP = 'JWT';

export interface JwtPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function hmac(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

/**
 * JWT 过期秒数 — 与 cloud-functions/_jwt.ts 保持一致(3 天)。
 * Agent 这一层不签发 token,但保留导出常量以便复用。
 */
export const JWT_TTL_SECONDS = 3 * 24 * 60 * 60;

export function signJwt(
  payload: { sub: string; username: string },
  secret: string,
  ttlSec = JWT_TTL_SECONDS,
): string {
  if (!secret) throw new Error('JWT_SECRET is required');
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { sub: payload.sub, username: payload.username, iat: now, exp: now + ttlSec };
  const headerB64 = b64urlEncode(JSON.stringify({ alg: ALG, typ: TYP }));
  const payloadB64 = b64urlEncode(JSON.stringify(full));
  const sig = b64urlEncode(hmac(secret, `${headerB64}.${payloadB64}`));
  return `${headerB64}.${payloadB64}.${sig}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  if (!secret) throw new Error('JWT_SECRET is required');
  if (typeof token !== 'string' || !token) throw new Error('token missing');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;

  const expected = hmac(secret, `${headerB64}.${payloadB64}`);
  const actual = b64urlDecode(sigB64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('signature mismatch');
  }

  let header: { alg?: string };
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  } catch {
    throw new Error('header not json');
  }
  if (header.alg !== ALG) throw new Error(`unsupported alg: ${header.alg}`);

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('payload not json');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new Error('token expired');
  }
  return payload;
}

export function readCookie(
  headers: Headers | Record<string, string | undefined> | undefined | null,
  key: string,
): string | null {
  if (!headers) return null;
  let raw: string | null | undefined;
  if (typeof (headers as Headers).get === 'function') {
    raw = (headers as Headers).get('cookie');
  } else {
    const obj = headers as Record<string, string | undefined>;
    raw = obj['cookie'] ?? obj['Cookie'];
  }
  if (!raw) return null;

  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === key) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// ── 高阶辅助:从 Agent / cf context 一次性取出已验证身份 ─────────

const COOKIE_NAME = 'jwt_token';

/** 校验失败抛 AuthError;调用方 catch 后返回 401 Response。 */
export class AuthError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'AuthError';
  }
}

/**
 * 从 context 中提取并校验 JWT,返回 payload。
 *
 * 期望 context 形态:
 *   - context.request.headers (Headers | Record)
 *   - context.env.JWT_SECRET
 *
 * 失败抛 AuthError;由调用方决定如何响应。
 */
export function requireAuth(context: {
  request: { headers: Headers | Record<string, string | undefined> };
  env?: Record<string, string | undefined>;
}): JwtPayload {
  const secret = context.env?.JWT_SECRET ?? process.env?.JWT_SECRET;
  if (!secret) throw new AuthError('JWT_SECRET not configured');

  const token = readCookie(context.request.headers, COOKIE_NAME);
  if (!token) throw new AuthError('no auth cookie');

  try {
    return verifyJwt(token, secret);
  } catch (e) {
    throw new AuthError((e as Error).message || 'verify failed');
  }
}

/** 401 标准响应 — 给所有需要早拒的入口复用。 */
export function unauthorizedResponse(reason = 'unauthorized'): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', reason }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
