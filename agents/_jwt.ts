/**
 * JWT (HS256) — Agent Runtime
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
 * JWT TTL — kept in sync with cloud-functions/_jwt.ts (3 days).
 * The agent layer doesn't sign tokens, but the constant is exported for parity.
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

// ── High-level helpers — exposes verified identity from a context object ──

const COOKIE_NAME = 'jwt_token';

/** Thrown by requireAuth on any verification failure. */
export class AuthError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'AuthError';
  }
}

/**
 * Extract & verify the JWT from `context`. Throws AuthError on failure;
 * the caller decides how to respond.
 *
 * Expected context shape:
 *   - context.request.headers   (Headers | Record)
 *   - context.env.JWT_SECRET
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
