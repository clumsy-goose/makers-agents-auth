/**
 * JWT (HS256) — Node Runtime 版
 * ================================
 * 用于 cloud-functions/* 与 agents/*。
 *
 * 与 middleware (Web Crypto) 端的 ./lib/edge-jwt.js 在以下方面严格一致:
 *   - 算法:HMAC-SHA256
 *   - Header: { "alg": "HS256", "typ": "JWT" }
 *   - 编码:base64url(无 padding)
 *   - Payload 形状:{ sub, username, iat, exp }
 *
 * **重要**:Agent / cf 内部必须用本工具独立验签,绝不读 mw 写的任何 header
 * (双层防御铁律:防直连绕过)。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALG = 'HS256';
const TYP = 'JWT';

export interface JwtPayload {
  sub: string;        // user id (uuid)
  username: string;
  iat: number;        // 签发时间(秒)
  exp: number;        // 过期时间(秒)
}

// ── base64url helpers ─────────────────────────────────────────

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

// ── public API ────────────────────────────────────────────────

/**
 * 签发 JWT。
 *
 * @param payload 至少包含 sub / username,iat / exp 由本函数自动注入
 * @param secret  共享密钥(JWT_SECRET)
 * @param ttlSec  过期秒数,默认 86400(1 天)
 */
export function signJwt(
  payload: { sub: string; username: string },
  secret: string,
  ttlSec = 86400,
): string {
  if (!secret) throw new Error('JWT_SECRET is required');
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = {
    sub: payload.sub,
    username: payload.username,
    iat: now,
    exp: now + ttlSec,
  };
  const headerB64 = b64urlEncode(JSON.stringify({ alg: ALG, typ: TYP }));
  const payloadB64 = b64urlEncode(JSON.stringify(full));
  const sig = b64urlEncode(hmac(secret, `${headerB64}.${payloadB64}`));
  return `${headerB64}.${payloadB64}.${sig}`;
}

/**
 * 校验 JWT。失败时**抛异常**(由调用方决定 401 / 重定向)。
 *
 * - 签名比对使用 timingSafeEqual,防时序攻击
 * - 过期立即拒绝
 */
export function verifyJwt(token: string, secret: string): JwtPayload {
  if (!secret) throw new Error('JWT_SECRET is required');
  if (typeof token !== 'string' || !token) throw new Error('token missing');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;

  // 1) 重算签名
  const expected = hmac(secret, `${headerB64}.${payloadB64}`);
  const actual = b64urlDecode(sigB64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('signature mismatch');
  }

  // 2) 解析 payload
  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('payload not json');
  }

  // 3) header alg 检查(防 alg=none 攻击)
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  } catch {
    throw new Error('header not json');
  }
  if (header.alg !== ALG) throw new Error(`unsupported alg: ${header.alg}`);

  // 4) 过期检查
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new Error('token expired');
  }
  return payload;
}

// ── Cookie 解析 ──────────────────────────────────────────────

/**
 * 从 Cookie 头中取出指定 key。同时兼容:
 *   - cf / mw 的 Headers 实例 (.get('cookie'))
 *   - Agent Runtime 的纯对象 headers (headers['cookie'])
 */
export function readCookie(
  headers: Headers | Record<string, string | undefined>,
  key: string,
): string | null {
  let raw: string | null | undefined;
  if (headers instanceof Headers) {
    raw = headers.get('cookie');
  } else if (headers && typeof headers === 'object') {
    raw = (headers as Record<string, string | undefined>)['cookie']
      ?? (headers as Record<string, string | undefined>)['Cookie'];
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

// ── Cookie 序列化(给 cf 用) ─────────────────────────────────

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
  maxAge?: number;
  domain?: string;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  else parts.push('Path=/');
  if (typeof opts.maxAge === 'number') parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

// ── 高阶辅助:与 agents/_jwt.ts 对齐 ──────────────────────────

export const COOKIE_NAME = 'eo_token';

export class AuthError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'AuthError';
  }
}

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

export function unauthorizedResponse(reason = 'unauthorized'): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', reason }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
