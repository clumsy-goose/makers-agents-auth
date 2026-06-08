/**
 * EdgeOne Pages Middleware
 * ==========================
 *
 * 方案一 · 边缘节点早拒鉴权层(Edge V8 Runtime)。
 *
 * 职责严格对齐 pages-agent-auth-flow.html 第②/⑨步:
 *   - matcher 是受保护路径的**唯一真理来源**:命中即验签,未命中根本不进入本文件
 *   - 受保护路径(/chat, /stop, /history, /agents/*, /admin/*):
 *       - Web Crypto HS256 验签 Cookie jwt_token
 *       - 失败 → 401 立即拒绝
 *       - 成功 → next() 透传(不写任何 header,Agent / cf 自己再独立验签)
 *   - /auth/*、静态资源、前端路由不在 matcher 中,平台路由直接派发,不经此函数
 *
 * 重要约束:
 *   - 仅 Web Crypto API (globalThis.crypto.subtle),禁用 node:crypto / process.*
 *   - 经平台 esbuild 编译注入 next/redirect/rewrite,通过 context.env 取 secret
 *
 * 本文件由 EdgeOne CLI 自动加载,无需在 edgeone.json 中显式注册。
 */

const COOKIE_NAME = 'jwt_token';
const ALG = 'HS256';

// ── base64url helpers ─────────────────────────────────────
// btoa/atob 在 Edge 环境可用,用其拼出 base64url 编解码

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
 * 常量时间比较两个 Uint8Array,防时序攻击
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
 * 用 Web Crypto 验证 HS256 JWT。
 * 与 cloud-functions/_jwt.ts 的 verifyJwt 字节级一致。
 *
 * @param {string} token  待验证 token
 * @param {string} secret 共享密钥
 * @returns {Promise<{ sub: string, username: string, iat: number, exp: number }>}
 * @throws 任何环节失败均抛错
 */
async function verifyJwt(token, secret) {
  if (!secret) throw new Error('JWT_SECRET missing');
  if (typeof token !== 'string' || !token) throw new Error('token missing');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;

  // 1) Header alg 检查(防 alg=none)
  let header;
  try {
    header = JSON.parse(bytesToUtf8(b64urlToBytes(headerB64)));
  } catch {
    throw new Error('header not json');
  }
  if (header.alg !== ALG) throw new Error('unsupported alg');

  // 2) HMAC-SHA256 验签
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

  // 3) 过期校验
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

// ── Cookie 解析 ───────────────────────────────────────────

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

// ── 主函数 ───────────────────────────────────────────────
// 进入此函数的请求 = 命中 matcher = 受保护路径,直接验签即可。

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

// ── 路由匹配配置 ─────────────────────────────────────────
// matcher 即受保护路径白名单 — 唯一真理来源。
// 未命中的路径(/auth/*、静态资源、前端路由)由平台路由直接派发,不经本文件。
export const config = {
  matcher: [
    '/chat/:path*',
    '/stop/:path*',
    '/history/:path*',
    '/agents/:path*',
    '/admin/:path*',
  ],
};
