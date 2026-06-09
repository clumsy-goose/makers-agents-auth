# OpenAI Agents Auth Starter `<!-- TODO: confirm display name -->`

**Language:** English | [简体中文](./README_zh-CN.md)

> A streaming chat agent built with the **OpenAI Agents SDK** on EdgeOne Makers — with end-to-end authentication (edge middleware + cloud-functions + Agent self-verify) backed by Neon Postgres.

**Framework:** OpenAI Agents SDK · **Category:** Chat `<!-- TODO: confirm category -->` · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=makers-agent-auth&from=within&fromAgent=1&agentLang=typescript)

## Overview

A production-shaped chat-agent template that demonstrates the **two-layer defense** authentication scheme on EdgeOne Pages: Web Crypto early-reject at the edge, plus independent JWT re-verification inside the Agent runtime — so the chat path stays safe even if the edge is bypassed. Account state lives in Neon Postgres over HTTPS.

- **Two-layer auth defense** — `middleware.js` rejects unsigned requests at the edge; `agents/chat` re-verifies HMAC independently with the same `JWT_SECRET`
- **SSE streaming chat** — token-by-token output and tool-call events powered by OpenAI Agents SDK
- **Neon Postgres over HTTPS** — `@neondatabase/serverless` with parameterised tag-template SQL; no TCP driver, no DB ops
- **bcrypt-hashed passwords** — register / login / user / logout cloud-functions running on Node 20
- **Anonymous-first UI** — guests browse the homepage freely; the login modal pops only when a protected request hits 401 (or on guest-Send), and auto-resends the original message after sign-in
- **Custom tools, session memory, stop generation** — all the Agent primitives wired end to end

## Environment Variables

| Variable                | Required | Description                                                                                                                                                            |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`  | Yes      | Model gateway API key. Use your**Makers Models API Key**, or any OpenAI-compatible provider key.                                                                 |
| `AI_GATEWAY_BASE_URL` | Yes      | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`.                                                                                       |
| `JWT_SECRET`          | Yes      | HMAC-SHA256 secret shared by middleware, cloud-functions, and the Agent runtime — each layer verifies the same JWT independently. Generate ≥ 48 bytes of randomness. |
| `DATABASE_URL`        | Yes      | Neon Postgres HTTPS connection string (`postgresql://...?sslmode=require`). Used by the auth cloud-functions (login / register / user lookup).                                         |

> This template follows the **OpenAI-compatible** standard — point the `AI_GATEWAY_*` variables at Makers Models or any other compatible gateway / provider.

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://console.cloud.tencent.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY` (set `AI_GATEWAY_BASE_URL` to `https://ai-gateway.edgeone.link/v1`).

Built-in models (`@makers/deepseek-v4-flash`, `@makers/hy3-preview`, `@makers/minimax-m2.7`) are free and rate-limited — great for prototyping. For production, bind your own provider key (BYOK) in the console.

### How to set up Neon Postgres

1. Sign up at [neon.tech](https://neon.tech) and create a project (pick a region close to your EdgeOne nodes — e.g. AWS Singapore / Tokyo).
2. From the project Dashboard, copy the **HTTP** connection string (it begins with `postgresql://...` and ends with `?sslmode=require`) into `DATABASE_URL`.
3. Run the migration in Neon's SQL Editor (the file lives at `db/migrations/users.sql`):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE TABLE IF NOT EXISTS users (
     id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
     username      VARCHAR(64)  NOT NULL,
     password_hash VARCHAR(255) NOT NULL,
     created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
   );
   CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq ON users (LOWER(username));
   ```
4. Verify the connection with `node scripts/db-check.mjs`.

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

## How It Works

The template implements the **"middleware + cloud-functions + Agent self-verify"** authentication scheme. The agent runs in **session mode** under `agents/`: requests sharing the same `Markers-Conversation-Id` header are stickily routed to the same Agent instance and persistent store.

### Stage 1 · Sign up / sign in

1. Browser POSTs `{ username, password }` to `/auth/login` or `/auth/register`.
2. `/auth/*` is **not** in `middleware.js`'s matcher, so the platform routes the request directly to the cloud-function — no JWT required at this stage.
3. `cloud-functions/auth/{login,register}/index.ts` (Node 20) reads / writes the `users` table via `@neondatabase/serverless` — tag-template SQL parameterises automatically (no SQL injection).
4. The password is verified or hashed with **bcryptjs** (cost 10).
5. **node:crypto** signs an HS256 JWT using `JWT_SECRET` (3-day TTL).
6. The function returns `200 OK` with `Set-Cookie: jwt_token=…; HttpOnly; Secure; SameSite=Lax`.

### Stage 2 · Agent call (with cookie)

1. Browser POSTs `/chat` with `Cookie: jwt_token=…` and the `Markers-Conversation-Id: <uuid>` header.
2. `middleware.js`'s matcher (`/chat`, `/stop`, `/history`) verifies the JWT with **Web Crypto** HS256. On failure it short-circuits with `401`. On success it `next()`s the request through, **without writing any header** — the agent must verify on its own.
3. `agents/chat/index.ts` calls `requireAuth(context)`, which uses **node:crypto** HMAC and the same `JWT_SECRET` to verify the cookie independently. **This is the dual-defense rule**: even if the edge is bypassed, the agent still 401s.
4. The agent emits an `auth_ok` SSE event as the first frame so the second-layer verification is observable (visible in the in-browser DebugPanel and via `curl -N`).
5. The agent injects the JWT-verified `username` / `sub` into the model instructions and runs the OpenAI Agents SDK tool loop, streaming `text_delta` events back over SSE.

### Routes

| Method | Path               | Handler                           | Auth     |
| ------ | ------------------ | --------------------------------- | -------- |
| POST   | `/auth/register` | `cloud-functions/auth/register` | public   |
| POST   | `/auth/login`    | `cloud-functions/auth/login`    | public   |
| GET    | `/auth/user`     | `cloud-functions/auth/user`     | required |
| POST   | `/auth/logout`   | `cloud-functions/auth/logout`   | public   |
| POST   | `/chat`          | `agents/chat`                   | required |
| POST   | `/stop`          | `agents/stop`                   | required |
| POST   | `/history`       | `cloud-functions/history`       | required |

### Runtime parameters

`edgeone.json` controls the Agent timeout (`agents.timeout`) and sandbox lifetime (`agents.sandbox.timeout`); both accept values from 300 to 3600 seconds inclusive.

## License

MIT
