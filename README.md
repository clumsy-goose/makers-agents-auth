# Agents Login Auth Starter

**Language:** English | [简体中文](./README_zh-CN.md)

> A streaming chat agent template built with the **OpenAI Agents SDK** on EdgeOne Makers — with end-to-end authentication (edge middleware + Cloud Functions + Agent self-verify) backed by Neon Postgres.

**Framework:** OpenAI Agents SDK · **Category:** Quick Start · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=makers-agent-auth&from=within&fromAgent=1&agentLang=typescript)

## Overview

Agent applications typically call models and tools. Without login authentication, anyone can hit the Agent endpoints directly, which leads to:

- **Resource abuse** — anonymous traffic burns through your LLM and tool-call quota.
- **Endpoint bypass** — attackers skip the frontend page and call `/chat`, `/stop` and other endpoints directly.

This doc shows how to build a login-auth flow on the Makers platform: Cloud Functions handle login / register and JWT signing, while the platform middleware rejects unauthenticated requests at the edge.

## Project Files & Responsibilities

| File / Module               | Responsibility                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `middleware.js`           | Platform middleware — verifies the cookie JWT on protected paths; 401 on failure,`next()` on success |
| `cloud-functions/auth/*`  | Login, register, logout, current user — verifies credentials and signs the JWT                         |
| `agents/chat/index.ts`    | Agent entry — demonstrates auth verification and streaming responses                                   |
| `db/migrations/users.sql` | Neon database schema                                                                                    |

## How It Works

### Core flow

```text
Browser
   │
   │  Login / Register
   ▼
cloud-functions/auth/*
   │  Verify credentials
   │  Read / write Neon
   │  Sign JWT
   ▼
Browser stores HttpOnly cookie: jwt_token
   │
   │  Call Agent
   ▼
middleware.js
   │  Verify cookie JWT
   │  Invalid → 401
   │  Valid   → next()
   ▼
Agent Runtime
   │  requireAuth(context) re-verifies
   │
   ▼
SSE stream / Agent response
```

### JWT payload

```ts
interface JwtPayload {
  sub: string;       // users.id, UUID v4
  username: string;  // username
  iat: number;       // issued-at, seconds since epoch
  exp: number;       // expires-at, seconds since epoch
}
```

## Request Flows

### Login / Register

```text
Browser
  │
  │ ① POST /auth/login or /auth/register
  ▼
middleware.js
  │
  │ ② /auth/* is not in the matcher — pass through
  ▼
cloud-functions/auth/*
  │
  │ ③ Validate username / password
  │ ④ Read or write the Neon users table
  │ ⑤ bcrypt verify or hash password_hash
  │ ⑥ Sign JWT with JWT_SECRET
  ▼
Browser
  │
  │ ⑦ Set-Cookie: jwt_token=...
  ▼
Signed in
```

Key rules:

- `/auth/login` and `/auth/register` must be public endpoints
- They must NOT be added to `middleware.config.matcher`
- After sign-in the token lives in an **HttpOnly cookie** only — never exposed to frontend JS

### Agent call

```text
Browser
  │
  │ ⑧ POST /chat with Cookie: jwt_token=...
  ▼
middleware.js
  │
  │ ⑨ Web Crypto verifies the JWT
  │    Failure → 401
  │    Success → next()
  ▼
Agent Runtime
  │
  │ ⑩ requireAuth(context) re-verifies
  ▼
Browser
  │
  │ ⑪ SSE stream of the Agent response
```

Key rules:

- The middleware **only forwards** the original request after a successful verify
- The Agent reads the JWT from the cookie and verifies it independently

## Middleware — Key Implementation

File: `middleware.js`

Responsibility: on protected paths → verify the cookie JWT → 401 on failure / `next()` on success.

### Configure protected paths

```js
export const config = {
  matcher: [
    '/chat/:path*',
    '/stop/:path*',
    '/history/:path*',
  ],
};
```

Notes:

- `matcher` is the **single source of truth** for protected paths
- Do NOT add `/auth/*` to the matcher
- Static assets and SPA page routes generally don't need to be in the matcher either

### Main logic

```js
export async function middleware(context) {
  const { request, next, env } = context;

  const token = readCookie(request.headers, 'jwt_token');
  if (!token) return unauthorized('no auth cookie');

  try {
    await verifyJwt(token, env.JWT_SECRET);
  } catch (e) {
    return unauthorized(e.message || 'verify failed');
  }

  return next();
}
```

### Verification checklist

The middleware runs in the edge V8 environment and uses Web Crypto:

```js
const key = await crypto.subtle.importKey(
  'raw',
  utf8ToBytes(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);
```

Always check:

| Check                              | Purpose                                     |
| ---------------------------------- | ------------------------------------------- |
| Token has three segments           | Reject malformed tokens                     |
| `header.alg === 'HS256'`         | Defeat `alg=none` and algorithm confusion |
| HMAC signature matches             | Token was not tampered with                 |
| `payload.exp` is not in the past | Old tokens cannot live forever              |

## Cloud Functions — Key Implementation

Directory: `cloud-functions/`

Responsibility: register / login / current user / logout.

### File layout

| File                       | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `auth/register/index.ts` | Register a new user, write to Neon, sign a JWT |
| `auth/login/index.ts`    | Verify the password, sign a JWT                |
| `auth/user/index.ts`     | Identify the current user from the cookie      |
| `auth/logout/index.ts`   | Clear the cookie                               |

## Agent — Key Implementation

Example file: `agents/chat/index.ts`

The middleware's value is **early rejection**: anonymous traffic gets blocked at the edge, saving Agent Runtime, sandbox, and LLM cost. The middleware is not your final security boundary, though — re-verify on the Agent side as well:

```ts
import { requireAuth, AuthError, unauthorizedResponse } from '../_jwt';

export async function onRequest(context: any) {
  let auth;
  try {
    auth = requireAuth(context);
  } catch (e) {
    if (e instanceof AuthError) {
      return unauthorizedResponse(e.reason);
    }
    throw e;
  }
  // From here on, run the Agent business logic
}
```

## Database — Setup & Schema

Neon is Serverless Postgres. This template stores the user table there and accesses it over HTTPS via `@neondatabase/serverless`. You can swap in any other Postgres-compatible database.

### Setup steps

1. Create a project in the [Neon console](https://console.neon.tech/)
2. Copy the connection string — it looks like:

   ```text
   postgresql://<user>:<password>@<host>/<db>?sslmode=require
   ```
3. Configure `DATABASE_URL` and `JWT_SECRET` in your EdgeOne Makers project's environment variables. For local development, set the same names in `.env`.

### Table schema

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq
  ON users (LOWER(username));
```

Notes:

- `id` is generated by Postgres `gen_random_uuid()`
- `password_hash` stores only the bcrypt hash — never the plain password
- The `LOWER(username)` unique index prevents `Alice` and `alice` from registering side by side

## Environment Variables

| Variable                | Required | Description                                                                                                    |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`  | Yes      | Model gateway API key. Use your**Makers Models API Key** or any OpenAI-compatible provider key           |
| `AI_GATEWAY_BASE_URL` | Yes      | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`                                |
| `JWT_SECRET`          | Yes      | HMAC-SHA256 secret shared by middleware, cloud-functions, and the Agent runtime — generate ≥ 48 random bytes |
| `DATABASE_URL`        | Yes      | Neon Postgres HTTPS connection string (`postgresql://...?sslmode=require`)                                   |

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://console.cloud.tencent.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY` (set `AI_GATEWAY_BASE_URL` to `https://ai-gateway.edgeone.link/v1`).

Built-in models (`@makers/deepseek-v4-flash`, `@makers/hy3-preview`, `@makers/minimax-m2.7`) are free and rate-limited — great for prototyping. For production, bind your own provider key (BYOK) in the console.

### How to generate `JWT_SECRET`

```bash
openssl rand -base64 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

The same value must be configured for **all three layers** — middleware, cloud-functions, and the agent runtime. Each verifies independently; this is the dual-defense rule.

## Local Development

**Prerequisites:** Node.js, npm

```bash
npm install
cp .env.example .env
# fill in JWT_SECRET, DATABASE_URL, AI_GATEWAY_*
edgeone makers dev
```

Open `http://localhost:8080/agent-metrics` for the local observability panel.

> One command starts the full stack — `edgeone makers dev` spawns the Vite dev server as a child process and routes middleware / cloud-functions / agents through the same port. Don't run `npm run dev` separately: Vite alone bypasses the middleware and breaks the auth flow.

## Project Structure

```text
makers-agent-auth/
├── middleware.js                    # Edge V8 — Web Crypto HS256 verify; matcher = sole protected-path source
├── agents/
│   ├── chat/index.ts                # POST /chat — Agent self-verify + LLM stream
│   ├── stop/index.ts                # POST /stop — abort an active run (auth-gated)
│   ├── _jwt.ts                      # node:crypto JWT verify (Agent layer)
│   ├── _logger.ts
│   ├── _sse.ts                      # SSE response helper
│   └── _tools.ts                    # Custom tools (weather, translate, stats, …)
├── cloud-functions/
│   ├── auth/
│   │   ├── login/index.ts           # POST /auth/login    — bcrypt verify + sign JWT
│   │   ├── register/index.ts        # POST /auth/register — bcrypt hash + insert + sign JWT
│   │   ├── user/index.ts            # GET  /auth/user     — return current user + exp
│   │   └── logout/index.ts          # POST /auth/logout   — clear cookie
│   ├── history/index.ts             # POST /history       — auth-gated conversation history
│   ├── _jwt.ts                      # node:crypto JWT sign / verify (cf layer)
│   ├── _db.ts                       # Neon HTTPS client (cf layer)
│   ├── _validate.ts                 # username / password format guards
│   └── _logger.ts
├── db/migrations/
│   └── users.sql                    # users table schema
├── src/                             # Vite + React frontend
│   ├── auth/
│   │   ├── AuthGate.tsx             # Auth context + on-demand login modal
│   │   ├── UserPill.tsx             # Header user badge + sign-out menu
│   │   └── SignInButton.tsx         # Guest header CTA — opens the login modal
│   ├── components/                  # Chat UI components
│   ├── i18n/                        # zh / en strings
│   └── api.ts                       # Browser → backend wrappers + 401 interceptor
├── scripts/
│   └── db-check.mjs                 # Neon connection probe
├── edgeone.json                     # Agent runtime + cloud-functions config
└── package.json
```

> Files prefixed with `_` are private modules — not exposed as public routes by EdgeOne.

## Integration Steps

To bolt this auth scheme onto your own Agent project, follow this order:

1. Create a Neon database and run `db/migrations/users.sql`
2. Configure `DATABASE_URL` and `JWT_SECRET`
3. Copy `cloud-functions/auth/*`, `cloud-functions/_jwt.ts`, `cloud-functions/_db.ts`, `cloud-functions/_validate.ts`
4. Configure `middleware.js`'s `matcher` to cover every protected Agent path
5. Add `requireAuth(context)` as the first step in every Agent entry

## Resources

* [EdgeOne Makers Agents — Documentation](https://pages.edgeone.ai/document/agents)
* [EdgeOne Makers — Quick Start](https://pages.edgeone.ai/document/agents-quickstart)
* [Makers Models](https://pages.edgeone.ai/document/models)

## License

MIT
