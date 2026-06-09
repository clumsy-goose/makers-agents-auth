/**
 * JWT (HS256) — Node runtime
 * ================================
 * Used by cloud-functions/* and agents/*.
 *
 * Byte-for-byte compatible with the Web-Crypto verifier in middleware.js:
 *   - Algorithm:  HMAC-SHA256
 *   - Header:     { "alg": "HS256", "typ": "JWT" }
 *   - Encoding:   base64url (no padding)
 *   - Payload:    { sub, username, iat, exp }
 *
 * IMPORTANT: cf / agent code must verify independently with this module —
 * it must not trust any header written by the middleware (defense in depth
 * against direct path bypasses).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALG = 'HS256';
const TYP = 'JWT';

export interface JwtPayload {
  sub: string;        // user id (uuid)
  username: string;
  iat: number;        // issued-at (seconds)
  exp: number;        // expiry (seconds)
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
 * JWT TTL — single source of truth, shared by login / register / cookie maxAge.
 * 3 days: a compromise between short-TTL safety and not logging users out too often.
 */
export const JWT_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * Sign a JWT. iat / exp are injected automatically.
 *
 * @param payload at minimum `{ sub, username }`
 * @param secret  shared secret (JWT_SECRET)
 * @param ttlSec  expiry in seconds; defaults to JWT_TTL_SECONDS (3 days)
 */
export function signJwt(
  payload: { sub: string; username: string },
  secret: string,
  ttlSec = JWT_TTL_SECONDS,
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
 * Verify a JWT. Throws on any failure — callers decide whether to 401 / redirect.
 * Uses timingSafeEqual for the signature check; rejects expired tokens.
 */
export function verifyJwt(token: string, secret: string): JwtPayload {
  if (!secret) throw new Error('JWT_SECRET is required');
  if (typeof token !== 'string' || !token) throw new Error('token missing');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;

  // 1) Signature.
  const expected = hmac(secret, `${headerB64}.${payloadB64}`);
  const actual = b64urlDecode(sigB64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('signature mismatch');
  }

  // 2) Payload.
  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('payload not json');
  }

  // 3) Header alg (defends against alg=none).
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  } catch {
    throw new Error('header not json');
  }
  if (header.alg !== ALG) throw new Error(`unsupported alg: ${header.alg}`);

  // 4) Expiry.
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new Error('token expired');
  }
  return payload;
}

// ── Cookie parsing ───────────────────────────────────────────

/**
 * Read a cookie value by name. Accepts either:
 *   - a Headers instance (cf / mw — uses .get('cookie'))
 *   - a plain object (Agent runtime — uses headers['cookie'])
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

// ── Cookie serialization (cf only) ───────────────────────────

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

// ── High-level helpers (mirrored in agents/_jwt.ts) ──────────

export const COOKIE_NAME = 'jwt_token';

/** Thrown by requireAuth on any verification failure. */
export class AuthError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'AuthError';
  }
}

/**
 * Extract & verify the JWT from `context`. Throws AuthError on failure;
 * the caller decides how to respond (typically: unauthorizedResponse).
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

/** Standard 401 response — reused by every early-reject entry. */
export function unauthorizedResponse(reason = 'unauthorized'): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', reason }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
