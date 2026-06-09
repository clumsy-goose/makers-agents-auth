/**
 * EdgeOne Pages Middleware
 * ==========================
 *
 * Edge V8 runtime — early-reject auth layer.
 *
 * Responsibilities:
 *   - The matcher is the single source of truth for protected paths:
 *     a request reaches this file only if it matched.
 *   - Protected paths (/chat, /stop, /history):
 *       - Verify HS256 JWT in cookie `jwt_token` via Web Crypto
 *       - On failure: 401
 *       - On success: next() — without writing any header.
 *         Agent / cf must verify the JWT independently.
 *   - /auth/*, static assets and frontend routes are NOT in the matcher
 *     and are dispatched directly by the platform.
 *
 * Constraints:
 *   - Web Crypto API only (globalThis.crypto.subtle); no node:crypto / process.*
 *   - The platform's esbuild step injects next/redirect/rewrite; secrets come
 *     from context.env.
 *
 * EdgeOne CLI auto-loads this file; no edgeone.json registration needed.
 */

const COOKIE_NAME = 'jwt_token';
const ALG = 'HS256';

// base64url helpers — atob/btoa are available in the Edge runtime.

/** @param {string} str base64url */
function b64urlToBytes(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

/**
 * Constant-time comparison — guards against timing attacks.
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify an HS256 JWT with Web Crypto.
 * Byte-for-byte compatible with cloud-functions/_jwt.ts verifyJwt.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<{ sub: string, username: string, iat: number, exp: number }>}
 * @throws on any failure
 */
async function verifyJwt(token, secret) {
  if (!secret) throw new Error('JWT_SECRET missing');
  if (typeof token !== 'string' || !token) throw new Error('token missing');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;

  // 1) Header alg check (defends against alg=none).
  let header;
  try {
    header = JSON.parse(bytesToUtf8(b64urlToBytes(headerB64)));
  } catch {
    throw new Error('header not json');
  }
  if (header.alg !== ALG) throw new Error('unsupported alg');

  // 2) HMAC-SHA256 signature check.
  const key = await crypto.subtle.importKey(
    'raw',
    utf8ToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, utf8ToBytes(`${headerB64}.${payloadB64}`)),
  );
  const actual = b64urlToBytes(sigB64);
  if (!timingSafeEqual(expected, actual)) throw new Error('signature mismatch');

  // 3) Expiry check.
  let payload;
  try {
    payload = JSON.parse(bytesToUtf8(b64urlToBytes(payloadB64)));
  } catch {
    throw new Error('payload not json');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('expired');

  return payload;
}

function readCookie(headers, key) {
  const raw = headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === key) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function unauthorized(reason) {
  return new Response(
    JSON.stringify({ error: 'unauthorized', reason }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

// Any request reaching this function has matched a protected path — verify JWT.
export async function middleware(context) {
  const { request, next, env } = context;
  const token = readCookie(request.headers, COOKIE_NAME);
  if (!token) return unauthorized('no auth cookie');
  try {
    await verifyJwt(token, env.JWT_SECRET);
  } catch (e) {
    return unauthorized(e.message || 'verify failed');
  }
  return next();
}

export const config = {
  matcher: [
    '/chat/:path*',
    '/stop/:path*',
    '/history/:path*',
  ],
};
