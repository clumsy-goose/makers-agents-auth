# OpenAI Agents Auth Starter <!-- TODO: confirm display name -->

**Language:** English | [简体中文](./README_zh-CN.md)

> A streaming chat agent built with the **OpenAI Agents SDK** on EdgeOne Makers — with end-to-end authentication (edge middleware + cloud-functions + Agent self-verify + Neon Postgres) and a live auth-chain trace UI.

**Framework:** OpenAI Agents SDK · **Category:** Chat <!-- TODO: confirm category --> · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=makers-agent-auth&from=within&fromAgent=1&agentLang=typescript)

<!-- Optional but recommended: a screenshot or GIF of the agent in action -->
<!-- TODO: add ./assets/preview.png -->

## Overview

A production-shaped chat-agent template that demonstrates the **two-layer defense** authentication scheme on EdgeOne Pages: Web Crypto early-reject at the edge, plus independent JWT re-verification inside the Agent runtime — so the chat path stays safe even if the edge is bypassed. Account state lives in Neon Postgres over HTTPS; the front end visualises the entire request chain in real time.

- **Two-layer auth defense** — `middleware.js` rejects unsigned requests at the edge; `agents/chat` re-verifies HMAC independently with the same `JWT_SECRET`
- **SSE streaming chat** — token-by-token output and tool-call events powered by OpenAI Agents SDK
- **Neon Postgres over HTTPS** — `@neondatabase/serverless` with parameterised tag-template SQL; no TCP driver, no DB ops
- **bcrypt-hashed passwords** — register / login / me / logout cloud-functions running on Node 20
- **Live auth-chain trace** — every message lights up a 5-node pipeline (Browser → Middleware → Agent → Neon → Response) with real timings
- **Custom tools, session memory, stop generation** — all the Agent primitives wired end to end

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your **Makers Models API Key**, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/hy3-preview` (a free built-in model). |
| `JWT_SECRET` | Yes | HMAC-SHA256 secret shared by middleware, cloud-functions, and the Agent runtime — each layer verifies the same JWT independently. Generate ≥ 48 bytes of randomness. |
| `DATABASE_URL` | Yes | Neon Postgres HTTPS connection string (`postgresql://...?sslmode=require`). Used by login / register / agent profile lookup. |
| `JWT_TTL_SECONDS` | No | JWT expiry in seconds. Defaults to `86400` (1 day). |
| `COOKIE_DOMAIN` | No | Cookie `Domain` attribute. Only set when the front end and API live on different domains. |
| `EDGEONE_AGENT_LOCAL_IN_MEMORY_STORE` | No | Set `1` for **local dev only** to bypass Pages Blob credentials and use an in-memory agent memory store. Do **not** set in production. |

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
3. Run the migration in Neon's SQL Editor (the file lives at `db/migrations/0001_users.sql`):
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
├── middleware.js                    # Edge V8 — Web Crypto HS256 JWT early-reject
├── agents/
│   ├── chat/index.ts                # POST /chat — Agent self-verify + Neon read + LLM stream
│   ├── stop/index.ts                # POST /stop — abort an active run (auth-gated)
│   ├── _jwt.ts                      # node:crypto JWT verify (Agent layer)
│   ├── _db.ts                       # Neon HTTPS client (Agent layer)
│   ├── _logger.ts
│   ├── _sse.ts                      # SSE response helper
│   └── _tools.ts                    # Custom tools (weather, translate, stats, …)
├── cloud-functions/
│   ├── auth/
│   │   ├── login/index.ts           # POST /auth/login    — bcrypt verify + sign JWT
│   │   ├── register/index.ts        # POST /auth/register — bcrypt hash + insert + sign JWT
│   │   ├── me/index.ts              # GET  /auth/me       — return current user + exp
│   │   └── logout/index.ts          # POST /auth/logout   — clear cookie
│   ├── history/index.ts             # POST /history       — auth-gated conversation history
│   ├── _jwt.ts                      # node:crypto JWT sign / verify (cf layer)
│   ├── _db.ts                       # Neon HTTPS client (cf layer)
│   ├── _validate.ts                 # username / password format guards
│   └── _logger.ts
├── db/migrations/
│   └── 0001_users.sql               # users table schema
├── src/                             # Vite + React frontend
│   ├── auth/
│   │   ├── AuthGate.tsx             # /login + /register split-screen UI
│   │   ├── UserPill.tsx             # Header user badge + sign-out menu
│   │   ├── WelcomeFlash.tsx         # Post-login chain-activation toast
│   │   └── AuthChainTrace.tsx       # Real-time 5-node auth-chain visualizer
│   ├── components/                  # Chat UI components
│   ├── i18n/                        # zh / en strings
│   └── api.ts                       # Browser → backend wrappers + 401 interceptor
├── scripts/
│   └── db-check.mjs                 # Neon connection probe
├── pages-agent-auth-flow.html       # Interactive architecture diagram (open in any browser)
├── SETUP.md                         # End-to-end deployment checklist
├── edgeone.json                     # Agent runtime + cloud-functions config
└── package.json
```

> Files prefixed with `_` are private modules — not exposed as public routes by EdgeOne.

## How It Works

The template implements the **"middleware + cloud-functions + Agent self-verify"** authentication scheme (see `pages-agent-auth-flow.html` for the full call-chain diagram). The agent runs in **session mode** under `agents/`: requests sharing the same `Markers-Conversation-Id` header are stickily routed to the same Agent instance and persistent store.

### Stage 1 · Sign up / sign in

1. Browser POSTs `{ username, password }` to `/auth/login` or `/auth/register`.
2. `middleware.js` matches `/auth/*` against its public-path allowlist and `next()`s the request through (no JWT yet).
3. `cloud-functions/auth/{login,register}/index.ts` (Node 20) reads / writes the `users` table via `@neondatabase/serverless` — tag-template SQL parameterises automatically (no SQL injection).
4. The password is verified or hashed with **bcryptjs** (cost 10).
5. **node:crypto** signs an HS256 JWT using `JWT_SECRET`.
6. The function returns `200 OK` with `Set-Cookie: eo_token=…; HttpOnly; Secure; SameSite=Lax`.

### Stage 2 · Agent call (with cookie)

1. Browser POSTs `/chat` with `Cookie: eo_token=…` and the `Markers-Conversation-Id: <uuid>` header.
2. `middleware.js` matches `/chat` against its protected-path list and verifies the JWT with **Web Crypto** HS256. On failure it short-circuits with `401`. On success it `next()`s the request through, **without writing any header** — the agent must verify on its own.
3. `agents/chat/index.ts` calls `requireAuth(context)`, which uses **node:crypto** HMAC and the same `JWT_SECRET` to verify the cookie independently. **This is the dual-defense rule**: even if the edge is bypassed, the agent still 401s.
4. The agent emits an `auth_ok` SSE event so the front end can prove the second-layer verification ran.
5. The agent reads the user profile from Neon over HTTPS, emitting `neon_query_start` / `neon_query_done` events with row count and latency.
6. The profile is injected into the agent's instructions, then the OpenAI Agents SDK runs the tool loop and streams `text_delta` events back over SSE.
7. The front-end `AuthChainTrace` component subscribes to these signals and lights up the 5-node pipeline (Browser → Middleware → Agent → Neon → Response) in real time.

### Routes

| Method | Path | Handler | Auth |
|---|---|---|---|
| POST | `/auth/register` | `cloud-functions/auth/register` | public |
| POST | `/auth/login` | `cloud-functions/auth/login` | public |
| GET  | `/auth/me` | `cloud-functions/auth/me` | required |
| POST | `/auth/logout` | `cloud-functions/auth/logout` | public |
| POST | `/chat` | `agents/chat` | required |
| POST | `/stop` | `agents/stop` | required |
| POST | `/history` | `cloud-functions/history` | required |

### Runtime parameters

`edgeone.json` controls the Agent timeout (`agents.timeout`) and sandbox lifetime (`agents.sandbox.timeout`); both accept values from 300 to 3600 seconds inclusive.

## Resources

- [Makers Agents Documentation](https://edgeone.ai/document/agents)
- [Quick Start: Agent Development](https://edgeone.ai/document/agents-quickstart)
- [Makers Models](https://edgeone.ai/document/models)
- [Neon Postgres](https://neon.tech)
- [Architecture diagram (interactive)](./pages-agent-auth-flow.html)
- [Deployment checklist](./SETUP.md)

## License

MIT
