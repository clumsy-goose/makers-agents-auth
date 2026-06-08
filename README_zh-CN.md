# OpenAI Agents 鉴权模板 <!-- TODO: 确认中文展示名 -->

**语言：** [English](./README.md) | 简体中文

> 基于 **OpenAI Agents SDK** 的流式聊天 Agent 模板,跑在 EdgeOne Makers 上 —— 内置端到端鉴权(边缘中间件 + cloud-functions + Agent 自验签),账号体系存在 Neon Postgres。

**框架：** OpenAI Agents SDK · **分类：** Chat <!-- TODO: 确认分类 --> · **语言：** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=makers-agent-auth&from=within&fromAgent=1&agentLang=typescript)

## 概述

生产形态的聊天 Agent 模板,演示 EdgeOne Pages 上的**双层防御**鉴权方案:边缘节点 Web Crypto 早拒,Agent 运行时再用同一个密钥独立 HMAC 自验签 —— 即便有人绕过边缘节点直连内部路径,Agent 也会 401 拒绝。账号体系存在 Neon Postgres 中,经 HTTPS 访问。

- **双层防御鉴权** — `middleware.js` 在边缘节点早拒,`agents/chat` 用同一个 `JWT_SECRET` 独立 HMAC 再验签
- **SSE 流式聊天** — 基于 OpenAI Agents SDK 的 token 级流式输出 + 工具调用事件
- **Neon Postgres over HTTPS** — `@neondatabase/serverless` 标签模板 SQL 自动参数化(防 SQLi),无 TCP 驱动,无数据库运维
- **bcrypt 密码哈希** — 注册 / 登录 / me / 登出 cloud-functions 跑在 Node 20
- **访客优先 UI** — 未登录可正常浏览首页;登录弹窗仅在(a)受保护接口返回 401 或(b)访客点 Send 时弹出,登录成功后自动续上原消息
- **自定义工具 + 会话记忆 + 停止生成** — 完整的 Agent 原语全链路打通

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `AI_GATEWAY_API_KEY` | 是 | 模型网关 API key,可用 **Makers Models API Key**,也可用任何 OpenAI 兼容厂商的 key |
| `AI_GATEWAY_BASE_URL` | 是 | 网关地址。Makers Models 用 `https://ai-gateway.edgeone.link/v1` |
| `JWT_SECRET` | 是 | HMAC-SHA256 密钥,middleware / cloud-functions / Agent 三处共用同一个,各自独立验签。建议 ≥ 48 字节随机 |
| `DATABASE_URL` | 是 | Neon Postgres HTTPS 连接串(`postgresql://...?sslmode=require`),用于登录 / 注册 / Agent profile 查询 |


> 本模板基于 **OpenAI 兼容**标准 — `AI_GATEWAY_*` 可指向 Makers Models 或任何兼容网关 / 厂商。

### 如何获取 `AI_GATEWAY_API_KEY`

1. 打开 [Makers 控制台](https://console.cloud.tencent.com/edgeone/makers)
2. 登录并启用 Makers
3. 进入 **Makers → 模型 → API Key**,创建一个 key
4. 复制到 `AI_GATEWAY_API_KEY`(`AI_GATEWAY_BASE_URL` 设为 `https://ai-gateway.edgeone.link/v1`)

内置模型(`@makers/deepseek-v4-flash` / `@makers/hy3-preview` / `@makers/minimax-m2.7`)免费且有配额,适合验证。生产请在控制台绑定自费厂商(BYOK)。

### 如何配置 Neon Postgres

1. 在 [neon.tech](https://neon.tech) 注册并新建项目(选离 EdgeOne 节点近的区域,如 AWS Singapore / Tokyo)
2. 项目 Dashboard → 复制 **HTTP** 连接串(以 `postgresql://...` 开头、以 `?sslmode=require` 结尾),粘贴到 `DATABASE_URL`
3. 在 Neon 的 SQL Editor 跑迁移(原文件在 `db/migrations/0001_users.sql`):
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
4. 验证连接:`node scripts/db-check.mjs`

### 如何生成 `JWT_SECRET`

```bash
openssl rand -base64 48
# 或
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

middleware / cloud-functions / Agent 三层都要配置**同一个**值,它们各自独立完成验签 —— 这就是双层防御铁律。

## 本地开发

**前置依赖：** Node.js, npm

```bash
npm install
cp .env.example .env
# 填好 JWT_SECRET / DATABASE_URL / AI_GATEWAY_*
edgeone makers dev
```

打开 `http://localhost:8080/agent-metrics` 查看本地可观测面板。

> 一条命令起整套服务 —— `edgeone makers dev` 会派生 Vite dev server 子进程,中间件 / cloud-functions / Agent 都挂在同一端口下。**不要**单独跑 `npm run dev`,Vite 单跑不会执行中间件,鉴权流程跑不通。

## 项目结构

```text
makers-agent-auth/
├── middleware.js                    # Edge V8 中间件 — Web Crypto HS256 验签;matcher 即受保护路径唯一来源
├── agents/
│   ├── chat/index.ts                # POST /chat — Agent 自验签 + 读 Neon + LLM 流式
│   ├── stop/index.ts                # POST /stop — 中止当前 run(需鉴权)
│   ├── _jwt.ts                      # node:crypto JWT 验签(Agent 层)
│   ├── _db.ts                       # Neon HTTPS 客户端(Agent 层)
│   ├── _logger.ts
│   ├── _sse.ts                      # SSE 响应辅助
│   └── _tools.ts                    # 自定义工具(天气 / 翻译 / 文本统计…)
├── cloud-functions/
│   ├── auth/
│   │   ├── login/index.ts           # POST /auth/login    — bcrypt 校验 + 签 JWT
│   │   ├── register/index.ts        # POST /auth/register  — bcrypt 哈希 + 入库 + 签 JWT
│   │   ├── me/index.ts              # GET  /auth/me        — 当前用户 + exp
│   │   └── logout/index.ts          # POST /auth/logout    — 清 Cookie
│   ├── history/index.ts             # POST /history        — 鉴权后的对话历史
│   ├── _jwt.ts                      # node:crypto JWT 签发 / 验签(cf 层)
│   ├── _db.ts                       # Neon HTTPS 客户端(cf 层)
│   ├── _validate.ts                 # 用户名 / 密码格式校验
│   └── _logger.ts
├── db/migrations/
│   └── 0001_users.sql               # users 表 schema
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

> 以 `_` 开头的文件是**私有模块**,EdgeOne 不会将它们映射为公开路由。

## 工作原理

本模板实现 **"中间件 + cloud-functions + Agent 自验签"** 鉴权方案。Agent 跑在 `agents/` 下的**会话模式**:相同 `Markers-Conversation-Id` 头的请求会被粘性路由到同一个 Agent 实例与 store。

### 阶段一 · 注册 / 登录

1. 浏览器 POST `{ username, password }` 到 `/auth/login` 或 `/auth/register`
2. `/auth/*` **不在** `middleware.js` 的 matcher 里,平台直接派发到 cloud-function —— 此阶段无需 JWT
3. `cloud-functions/auth/{login,register}/index.ts`(Node 20)用 `@neondatabase/serverless` 读写 `users` 表 —— 标签模板 SQL 自动参数化(杜绝 SQLi)
4. 密码用 **bcryptjs**(cost 10)校验或哈希
5. **node:crypto** 用 `JWT_SECRET` 签 HS256 JWT(3 天 TTL)
6. 函数返回 `200 OK` + `Set-Cookie: jwt_token=…; HttpOnly; Secure; SameSite=Lax`

### 阶段二 · Agent 调用(携带 Cookie)

1. 浏览器 POST `/chat`,带 `Cookie: jwt_token=…` 与 `Markers-Conversation-Id: <uuid>` 请求头
2. `middleware.js` 的 matcher(`/chat`、`/stop`、`/history`、`/agents/*`、`/admin/*`)用 **Web Crypto** HS256 验签。失败立即 `401`;成功 `next()` 透传,**不写任何 header** —— Agent 必须独立再验
3. `agents/chat/index.ts` 入口调 `requireAuth(context)`,用 **node:crypto** HMAC 和**同一个** `JWT_SECRET` 独立验签。**这就是双层防御铁律**:即便有人绕过边缘,Agent 也会 401
4. Agent 在流首帧 emit 一个 `auth_ok` SSE 事件,让第二层验签可观测(浏览器 DebugPanel 与 `curl -N` 都能看到)
5. Agent 用 JWT 里的 `sub` 通过 HTTPS 读 Neon 中的用户 profile,emit `neon_query_start` / `neon_query_done`(含行数、时延)
6. profile 注入到 Agent 的 instructions,OpenAI Agents SDK 跑工具循环,以 `text_delta` SSE 事件流式返回

### 路由

| 方法 | 路径 | 处理器 | 鉴权 |
|---|---|---|---|
| POST | `/auth/register` | `cloud-functions/auth/register` | 公开 |
| POST | `/auth/login` | `cloud-functions/auth/login` | 公开 |
| GET  | `/auth/me` | `cloud-functions/auth/me` | 需鉴权 |
| POST | `/auth/logout` | `cloud-functions/auth/logout` | 公开 |
| POST | `/chat` | `agents/chat` | 需鉴权 |
| POST | `/stop` | `agents/stop` | 需鉴权 |
| POST | `/history` | `cloud-functions/history` | 需鉴权 |

### 运行参数

`edgeone.json` 控制 Agent 超时(`agents.timeout`)与沙箱生命期(`agents.sandbox.timeout`),两者范围都是 300 ~ 3600 秒。

## License

MIT
