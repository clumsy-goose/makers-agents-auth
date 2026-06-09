/**
 * Agent Tools — private module (starts with _), not mapped as a route.
 *
 * These tools turn the chat agent into a knowledgeable assistant about the
 * EdgeOne Makers auth scheme. Each tool returns a curated documentation
 * snippet so the LLM grounds its answer in canonical content rather than
 * hallucinating.
 *
 * Tool descriptions are deliberately verbose and trigger-oriented — weak
 * function-calling models (e.g. preview-tier gateways) only invoke a tool
 * when the description literally matches the user's phrasing.
 */

import { tool } from '@openai/agents';
import { z } from 'zod';

// ========== Tool: Middleware documentation ==========
const getMiddlewareDoc = tool({
  name: 'get_middleware_doc',
  description:
    'Retrieve the official documentation snippet about EdgeOne Makers middleware: ' +
    'how the matcher works, what context.next() does, how to verify a JWT at the edge, ' +
    'and which Web Crypto APIs are available. ' +
    'Use this whenever the user asks how middleware works, how to configure matcher, ' +
    'how to write middleware.js, or how to protect a route at the edge.',
  parameters: z.object({
    topic: z
      .enum(['matcher', 'verify_jwt', 'main_logic', 'web_crypto'])
      .describe(
        'Which middleware topic to fetch: ' +
          '"matcher" for protected-path config, ' +
          '"main_logic" for the middleware() entry function, ' +
          '"verify_jwt" for HS256 verification details, ' +
          '"web_crypto" for the available Edge V8 crypto APIs.',
      ),
  }),
  execute: async ({ topic }) => {
    const docs: Record<string, string> = {
      matcher: [
        '# middleware.js · matcher (single source of truth for protected paths)',
        '',
        'The matcher array in `export const config` decides which requests reach',
        'middleware.js. Anything not listed is dispatched directly by the platform.',
        '',
        '```js',
        'export const config = {',
        '  matcher: [',
        "    '/chat/:path*',",
        "    '/stop/:path*',",
        "    '/history/:path*',",
        '  ],',
        '};',
        '```',
        '',
        'Rules:',
        '- /auth/* must NOT be in the matcher (login/register are public).',
        '- Static assets and SPA routes also stay out.',
        '- The matcher is the only place protected paths are declared — middleware.js',
        '  itself does not check the URL again.',
      ].join('\n'),

      main_logic: [
        '# middleware.js · main entry',
        '',
        '```js',
        'export async function middleware(context) {',
        '  const { request, next, env } = context;',
        '',
        "  const token = readCookie(request.headers, 'jwt_token');",
        "  if (!token) return unauthorized('no auth cookie');",
        '',
        '  try {',
        '    await verifyJwt(token, env.JWT_SECRET);',
        '  } catch (e) {',
        "    return unauthorized(e.message || 'verify failed');",
        '  }',
        '',
        '  return next();   // pass through; agent / cf must verify independently',
        '}',
        '```',
        '',
        'Three steps: read cookie → Web Crypto verify → next(). ',
        'The middleware never writes any header on success — this preserves the ',
        'dual-defense rule: each downstream layer verifies the JWT on its own.',
      ].join('\n'),

      verify_jwt: [
        '# HS256 JWT verification (Edge V8 / Web Crypto)',
        '',
        'Required checks (any failure → 401):',
        '1. Token is three base64url segments separated by ".".',
        "2. header.alg === 'HS256' — defends against alg=none and algorithm confusion.",
        '3. HMAC-SHA256 signature matches, compared with timing-safe equality.',
        '4. payload.exp is in the future.',
        '',
        '```js',
        'const key = await crypto.subtle.importKey(',
        "  'raw', utf8ToBytes(secret),",
        "  { name: 'HMAC', hash: 'SHA-256' },",
        "  false, ['sign', 'verify'],",
        ');',
        'const expected = new Uint8Array(',
        "  await crypto.subtle.sign('HMAC', key, utf8ToBytes(`${headerB64}.${payloadB64}`)),",
        ');',
        'if (!timingSafeEqual(expected, b64urlToBytes(sigB64)))',
        "  throw new Error('signature mismatch');",
        '```',
      ].join('\n'),

      web_crypto: [
        '# Web Crypto API in EdgeOne Pages middleware',
        '',
        'The middleware runs in an Edge V8 sandbox — node:crypto, process.*, and',
        'Buffer are NOT available. Only the Web Crypto subset is allowed:',
        '',
        '- `crypto.subtle.importKey(format, keyData, algo, extractable, usages)`',
        "- `crypto.subtle.sign('HMAC', key, data)`",
        "- `crypto.subtle.verify('HMAC', key, signature, data)`",
        '- `crypto.getRandomValues(typedArray)`',
        '- `atob` / `btoa` for base64',
        '- `TextEncoder` / `TextDecoder` for utf-8',
        '',
        'Anything not in this list will fail at deploy time, not at runtime.',
      ].join('\n'),
    };
    return docs[topic] ?? `No doc for topic: ${topic}`;
  },
});

// ========== Tool: Auth flow ==========
const getAuthFlow = tool({
  name: 'get_auth_flow',
  description:
    'Retrieve the step-by-step diagram and explanation of an authentication flow: ' +
    'either the login/register flow, the protected Agent-call flow, or the two-layer ' +
    'defense rationale. ' +
    'Use this when the user asks how authentication works end-to-end, what happens ' +
    'when someone signs in, why there are two layers of verification, or what the ' +
    'request lifecycle looks like.',
  parameters: z.object({
    flow: z
      .enum(['login_register', 'agent_call', 'two_layer_defense'])
      .describe(
        'Which flow to fetch: ' +
          '"login_register" for sign-up/sign-in path, ' +
          '"agent_call" for an authenticated /chat request, ' +
          '"two_layer_defense" for why middleware AND agent both verify the JWT.',
      ),
  }),
  execute: async ({ flow }) => {
    const flows: Record<string, string> = {
      login_register: [
        '# Login / Register flow',
        '',
        '```',
        'Browser',
        '  │ POST /auth/login or /auth/register',
        '  ▼',
        'middleware.js  (/auth/* is NOT in matcher → pass through)',
        '  ▼',
        'cloud-functions/auth/{login,register}',
        '  │ 1. validate username / password format',
        '  │ 2. read or write Neon users table',
        '  │ 3. bcrypt verify or hash password_hash',
        '  │ 4. sign HS256 JWT with JWT_SECRET (3-day TTL)',
        '  ▼',
        'Browser',
        '  Set-Cookie: jwt_token=...; HttpOnly; Secure; SameSite=Lax',
        '```',
        '',
        'Key rules:',
        '- /auth/login and /auth/register are PUBLIC — never add them to matcher.',
        '- Token lives in HttpOnly cookie only; frontend JS never reads the raw JWT.',
        '- bcrypt cost 10; passwords are never stored in plaintext.',
      ].join('\n'),

      agent_call: [
        '# Authenticated Agent call flow',
        '',
        '```',
        'Browser',
        '  │ POST /chat with Cookie: jwt_token=...',
        '  ▼',
        'middleware.js  (matcher matches /chat)',
        '  │ Web Crypto HS256 verify',
        '  │ failure → 401',
        '  │ success → next()',
        '  ▼',
        'agents/chat/index.ts',
        '  │ requireAuth(context) — node:crypto re-verify',
        '  │ emit auth_ok SSE event (observable)',
        '  │ run OpenAI Agents SDK tool loop',
        '  ▼',
        'Browser',
        '  SSE stream: text_delta, tool_called, done',
        '```',
        '',
        'Note: middleware does NOT write any header on success. The agent reads',
        'the cookie itself and verifies again — this is the two-layer rule.',
      ].join('\n'),

      two_layer_defense: [
        '# Two-layer defense rationale',
        '',
        'Layer 1 — Edge middleware (early reject):',
        '- Runs at the EdgeOne POP closest to the user.',
        '- Rejects unauthenticated traffic before it reaches the Agent runtime.',
        '- Saves Agent Sandbox cold-start cost and LLM token spend.',
        '- Implemented with Web Crypto (Edge V8 sandbox).',
        '',
        'Layer 2 — Agent / cloud-function (final boundary):',
        '- Re-verifies the JWT with node:crypto inside the Agent runtime.',
        '- Catches any path that bypasses the edge (e.g. internal mesh, stolen ',
        '  routing, future matcher misconfiguration).',
        '- Same JWT_SECRET is shared by all layers but each layer verifies ',
        '  independently — no cross-layer trust.',
        '',
        'Why both? Because middleware is for performance, not security. Treat the',
        'edge as a pre-filter; the Agent is the source of truth.',
      ].join('\n'),
    };
    return flows[flow] ?? `No flow for: ${flow}`;
  },
});

// ========== Tool: JWT spec ==========
const getJwtSpec = tool({
  name: 'get_jwt_spec',
  description:
    'Retrieve the JWT contract used in this template: payload claim names and types, ' +
    'TTL, signing algorithm, cookie attributes, and the verification checklist. ' +
    'Use this when the user asks about the JWT structure, what fields are inside the ' +
    'token, how long the token lives, what alg is used, or how the cookie is configured.',
  parameters: z.object({
    aspect: z
      .enum(['payload', 'cookie', 'algorithm', 'verification_checklist'])
      .describe(
        'Which JWT aspect to fetch: ' +
          '"payload" for the JwtPayload TypeScript interface, ' +
          '"cookie" for Set-Cookie attributes, ' +
          '"algorithm" for HS256 + secret-rotation guidance, ' +
          '"verification_checklist" for the 4 required checks per verify call.',
      ),
  }),
  execute: async ({ aspect }) => {
    const specs: Record<string, string> = {
      payload: [
        '# JWT payload contract',
        '',
        '```ts',
        'interface JwtPayload {',
        '  sub: string;       // users.id, UUID v4',
        '  username: string;  // human-readable username (case-preserved)',
        '  iat: number;       // issued-at, seconds since epoch',
        '  exp: number;       // expires-at, seconds since epoch',
        '}',
        '```',
        '',
        '- `sub` is the canonical user identifier — use this everywhere downstream.',
        '- `username` is informational; do not use it as a key.',
        '- TTL is fixed at 3 days (3 * 24 * 60 * 60 = 259200 seconds).',
      ].join('\n'),

      cookie: [
        '# JWT cookie attributes',
        '',
        '```',
        'Set-Cookie: jwt_token=<jwt>;',
        '            HttpOnly;       // JS cannot read it — defends against XSS',
        '            Secure;         // HTTPS only',
        '            SameSite=Lax;   // CSRF mitigation',
        '            Path=/;',
        '            Max-Age=259200; // 3 days',
        '```',
        '',
        'Cookie name is `jwt_token` — keep this consistent across middleware.js, ',
        'cloud-functions/_jwt.ts, and agents/_jwt.ts.',
      ].join('\n'),

      algorithm: [
        '# Signing algorithm: HS256',
        '',
        '- HMAC-SHA256 with a shared secret (JWT_SECRET).',
        '- Same secret must be configured for ALL three layers — middleware, ',
        '  cloud-functions, and the Agent runtime — but each layer verifies ',
        '  independently (no cross-layer trust).',
        '- Generate with: `openssl rand -base64 48` (≥ 48 random bytes).',
        '- To rotate the secret: re-deploy with the new value; existing cookies ',
        '  immediately become invalid and clients are forced to sign in again.',
        '',
        'Why HS256 instead of RS256/ES256?',
        '- Symmetric is sufficient because all verifying parties run on infra ',
        '  you control.',
        '- HMAC is faster and uses less memory than RSA — meaningful at the edge.',
      ].join('\n'),

      verification_checklist: [
        '# JWT verification checklist (every verify call MUST run all four)',
        '',
        '| # | Check                              | Defends against                |',
        '| - | ---------------------------------- | ------------------------------ |',
        '| 1 | Token has exactly three segments   | Malformed tokens               |',
        "| 2 | header.alg === 'HS256'             | alg=none / algorithm confusion |",
        '| 3 | HMAC signature matches (timing-safe)| Tampering / replay              |',
        '| 4 | payload.exp is in the future        | Expired-token replay           |',
        '',
        'Skipping any check breaks the security model. The middleware uses Web ',
        "Crypto's subtle.sign + a constant-time compare; cloud-functions and the ",
        'Agent use node:crypto.timingSafeEqual.',
      ].join('\n'),
    };
    return specs[aspect] ?? `No spec for aspect: ${aspect}`;
  },
});

// ========== Export ==========
/**
 * Factory that returns all available tools.
 * Add new tools to this array — the agent will automatically pick them up.
 */
export function createTools() {
  return [getMiddlewareDoc, getAuthFlow, getJwtSpec];
}
