# Agents 登录鉴权模板

**语言：** [English](./README.md) | 简体中文

> 基于 **OpenAI Agents SDK** 的流式聊天 Agent 模板，跑在 EdgeOne Makers 上 —— 内置端到端登录鉴权（边缘中间件 + Cloud Functions + Agent 自验签），账号体系存在 Neon Postgres。

**框架：** OpenAI Agents SDK · **分类：** Quick Start · **语言：** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=makers-agent-auth&from=within&fromAgent=1&agentLang=typescript)

## 概述

Agent 应用通常会调用模型、工具，如果没有登录鉴权，任何人都可以直接访问 Agent 接口，可能带来以下问题：

- **资源被滥用**：未登录用户也能消耗 LLM 和工具调用额度；
- **接口容易被绕过调用**：攻击者可以跳过前端页面，直接请求 `/chat`、`/stop` 等接口。

本文档说明如何基于 Makers 平台能力搭建登录鉴权流程：由 Cloud Functions 负责登录注册和 JWT 签发，由平台中间件在边缘节点提前拦截未登录请求。

## 项目主要文件与职责

| 文件 / 模块                 | 主要职责                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| `middleware.js`           | 平台中间件，命中受保护路径时先校验 Cookie JWT，失败直接 401，成功 `next()` |
| `cloud-functions/auth/*`  | 登录、注册、登出、查询当前用户，负责校验账号密码并签发 JWT                   |
| `agents/chat/index.ts`    | Agent 示例入口，演示鉴权、流式返回                                           |
| `db/migrations/users.sql` | Neon 数据库表结构                                                            |

## 实现原理

### 核心模型

```text
用户浏览器
   │
   │  登录 / 注册
   ▼
cloud-functions/auth/*
   │  校验账号密码
   │  写入 / 查询 Neon
   │  签发 JWT
   ▼
浏览器保存 HttpOnly Cookie: jwt_token
   │
   │  调用 Agent
   ▼
middleware.js
   │  先验 Cookie 里的 JWT
   │  无效：直接 401
   │  有效：next() 透传
   ▼
Agent Runtime
   │  再次 requireAuth(context)
   │
   ▼
返回 SSE / Agent 响应
```

### JWT 内容约定

```ts
interface JwtPayload {
  sub: string;       // users.id，UUID v4
  username: string;  // 用户名
  iat: number;       // 签发时间，秒级时间戳
  exp: number;       // 过期时间，秒级时间戳
}
```

## 实现流程

### 登录 / 注册流程

```text
浏览器
  │
  │ ① POST /auth/login 或 /auth/register
  ▼
middleware.js
  │
  │ ② /auth/* 不在 matcher 中，直接放行
  ▼
cloud-functions/auth/*
  │
  │ ③ 校验 username / password
  │ ④ 查询或写入 Neon users 表
  │ ⑤ bcrypt 校验或生成 password_hash
  │ ⑥ 使用 JWT_SECRET 签发 JWT
  ▼
浏览器
  │
  │ ⑦ Set-Cookie: jwt_token=...
  ▼
登录完成
```

关键点：

- `/auth/login`、`/auth/register` 必须是公开接口
- 它们不要放进 `middleware.config.matcher`
- 登录成功后只通过 **HttpOnly Cookie** 保存 token，不把 token 暴露给前端 JS

### Agent 调用流程

```text
浏览器
  │
  │ ⑧ POST /chat，自动携带 Cookie: jwt_token=...
  ▼
middleware.js
  │
  │ ⑨ Web Crypto 校验 JWT
  │    失败：401
  │    成功：next()
  ▼
Agent Runtime
  │
  │ ⑩ requireAuth(context) 再验一次 JWT
  ▼
浏览器
  │
  │ ⑪ SSE 流式返回 Agent 响应
```

关键点：

- 中间件验签成功后**只透传原请求**
- Agent 自己从 Cookie 读取 JWT，并独立验签

## 平台中间件关键实现

文件：`middleware.js`

职责：命中受保护路径 → 校验 Cookie JWT → 失败 401 / 成功 `next()`。

### 配置受保护路径

```js
export const config = {
  matcher: [
    '/chat/:path*',
    '/stop/:path*',
    '/history/:path*',
  ],
};
```

注意：

- `matcher` 是中间件保护范围的唯一来源
- `/auth/*` 不要加入 matcher
- 静态资源、前端页面路由一般也不需要加入 matcher

### 主逻辑

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

### 验签要点

中间件运行在边缘 V8 环境，使用 Web Crypto：

```js
const key = await crypto.subtle.importKey(
  'raw',
  utf8ToBytes(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);
```

验签时必须检查：

| 检查项                     | 目的                       |
| -------------------------- | -------------------------- |
| token 是否是三段式         | 防止 malformed token       |
| `header.alg === 'HS256'` | 防 `alg=none` 和算法混淆 |
| HMAC 签名是否一致          | 确认 token 未被篡改        |
| `payload.exp` 是否过期   | 防止旧 token 长期有效      |

## Cloud Functions 关键实现

目录：`cloud-functions/`

职责：注册 / 登录 / 当前用户信息 / 登出。

### 文件结构

| 文件                       | 作用                          |
| -------------------------- | ----------------------------- |
| `auth/register/index.ts` | 注册用户，写入 Neon，颁发 JWT |
| `auth/login/index.ts`    | 校验密码，颁发 JWT            |
| `auth/user/index.ts`     | 从 Cookie 判断当前登录用户    |
| `auth/logout/index.ts`   | 清空 Cookie                   |

## Agent 侧关键实现

文件示例：`agents/chat/index.ts`

中间件的价值是**早拒**：在边缘节点挡掉未登录请求，减少 Agent Runtime、Sandbox、LLM 的成本。但中间件不是最终安全边界，您可以在 Agent 侧再做一次验签：

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
  // 从这里开始，才能执行 Agent 业务逻辑
}
```

## 数据库配置与实现

Neon 是 Serverless Postgres，本方案用它保存用户表，并通过 `@neondatabase/serverless` 以 HTTPS 方式访问。您也可以选择其它第三方数据库。

### 配置步骤

1. 在 [Neon 控制台](https://console.neon.tech/)创建项目
2. 获取连接串，格式类似：

   ```text
   postgresql://<user>:<password>@<host>/<db>?sslmode=require
   ```
3. 在 EdgeOne Makers 项目环境变量中配置 `DATABASE_URL` 和 `JWT_SECRET`，本地开发时在 `.env` 中配置同名变量。

### 数据库表结构

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

说明：

- `id` 由 Postgres `gen_random_uuid()` 自动生成
- `password_hash` 只保存 bcrypt 哈希，不保存明文密码
- `LOWER(username)` 唯一索引用于避免 `Alice` 和 `alice` 同时注册

## 环境变量

| 变量                    | 必填 | 说明                                                                                       |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------ |
| `AI_GATEWAY_API_KEY`  | 是   | 模型网关 API key，可用**Makers Models API Key**，也可用任何 OpenAI 兼容厂商的 key    |
| `AI_GATEWAY_BASE_URL` | 是   | 网关地址。Makers Models 用 `https://ai-gateway.edgeone.link/v1`                          |
| `JWT_SECRET`          | 是   | HMAC-SHA256 密钥，middleware / cloud-functions / Agent 三处共用同一个，建议 ≥ 48 字节随机 |
| `DATABASE_URL`        | 是   | Neon Postgres HTTPS 连接串（`postgresql://...?sslmode=require`）                         |

### 如何获取 `AI_GATEWAY_API_KEY`

1. 打开 [Makers 控制台](https://console.cloud.tencent.com/edgeone/makers)
2. 登录并启用 Makers
3. 进入 **Makers → 模型 → API Key**，创建一个 key
4. 复制到 `AI_GATEWAY_API_KEY`（`AI_GATEWAY_BASE_URL` 设为 `https://ai-gateway.edgeone.link/v1`）

内置模型（`@makers/deepseek-v4-flash` / `@makers/hy3-preview` / `@makers/minimax-m2.7`）免费且有配额，适合验证。生产请在控制台绑定自费厂商（BYOK）。

### 如何生成 `JWT_SECRET`

```bash
openssl rand -base64 48
# 或
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

middleware / cloud-functions / Agent 三层都要配置**同一个**值，它们各自独立完成验签 —— 这就是双层防御铁律。

## 本地开发

**前置依赖：** Node.js, npm

```bash
npm install
cp .env.example .env
# 填好 JWT_SECRET / DATABASE_URL / AI_GATEWAY_*
edgeone makers dev
```

打开 `http://localhost:8080/agent-metrics` 查看本地可观测面板。

> 一条命令起整套服务 —— `edgeone makers dev` 会派生 Vite dev server 子进程，中间件 / cloud-functions / Agent 都挂在同一端口下。**不要**单独跑 `npm run dev`，Vite 单跑不会执行中间件，鉴权流程跑不通。

## 项目结构

```text
makers-agent-auth/
├── middleware.js                    # Edge V8 中间件 — Web Crypto HS256 验签；matcher 即受保护路径唯一来源
├── agents/
│   ├── chat/index.ts                # POST /chat — Agent 自验签 + LLM 流式
│   ├── stop/index.ts                # POST /stop — 中止当前 run（需鉴权）
│   ├── _jwt.ts                      # node:crypto JWT 验签（Agent 层）
│   ├── _logger.ts
│   ├── _sse.ts                      # SSE 响应辅助
│   └── _tools.ts                    # 自定义工具（天气 / 翻译 / 文本统计…）
├── cloud-functions/
│   ├── auth/
│   │   ├── login/index.ts           # POST /auth/login    — bcrypt 校验 + 签 JWT
│   │   ├── register/index.ts        # POST /auth/register — bcrypt 哈希 + 入库 + 签 JWT
│   │   ├── user/index.ts            # GET  /auth/user     — 当前用户 + exp
│   │   └── logout/index.ts          # POST /auth/logout   — 清 Cookie
│   ├── history/index.ts             # POST /history       — 鉴权后的对话历史
│   ├── _jwt.ts                      # node:crypto JWT 签发 / 验签（cf 层）
│   ├── _db.ts                       # Neon HTTPS 客户端（cf 层）
│   ├── _validate.ts                 # 用户名 / 密码格式校验
│   └── _logger.ts
├── db/migrations/
│   └── users.sql                    # users 表 schema
├── src/                             # Vite + React 前端
│   ├── auth/
│   │   ├── AuthGate.tsx             # 鉴权上下文 + 按需登录弹窗
│   │   ├── UserPill.tsx             # 头部用户徽章 + 登出菜单
│   │   └── SignInButton.tsx         # 访客头部 CTA — 唤起登录弹窗
│   ├── components/                  # 聊天 UI 组件
│   ├── i18n/                        # zh / en 文案
│   └── api.ts                       # 浏览器 → 后端封装 + 401 拦截
├── scripts/
│   └── db-check.mjs                 # Neon 连接探测
├── edgeone.json                     # Agent runtime + cloud-functions 配置
└── package.json
```

> 以 `_` 开头的文件是**私有模块**，EdgeOne 不会将它们映射为公开路由。

## 接入步骤

如果您要把这套方案接到自己的 Agent 项目，按这个顺序做：

1. 创建 Neon 数据库，执行 `db/migrations/users.sql`
2. 配置 `DATABASE_URL`、`JWT_SECRET`
3. 复制 `cloud-functions/auth/*`、`cloud-functions/_jwt.ts`、`cloud-functions/_db.ts`、`cloud-functions/_validate.ts`
4. 配置 `middleware.js` 的 `matcher`，覆盖所有受保护 Agent 路径
5. 在每个 Agent 入口第一步加入 `requireAuth(context)`

## 资源

* [EdgeOne Makers Agents 文档](https://pages.edgeone.ai/document/agents)
* [EdgeOne Makers 快速开始](https://pages.edgeone.ai/document/agents-quickstart)
* [Makers Models](https://pages.edgeone.ai/document/models)

## License

MIT
