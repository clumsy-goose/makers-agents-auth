# Makers Agents 模板 README 规范

> 本文给所有 Agent 模板仓库（供用户 clone / 一键部署）提供**统一的 README 结构、填写规范，以及一段可直接交给 AI 的"起手 Prompt"**。
>
> - **README 默认英文，并提供中文版入口**：英文写在 `README.md`，中文写在 `README_zh-CN.md`，在标题下加一行语言切换互链（参考 `edgeone-pages-test/vibe-coding-agent`）。本规范说明用中文，供模板作者参考。
> - 对标 GitHub 专业开源仓库：开头一眼说清"这是什么 / 哪类 Makers Agents 模板 / 什么框架"，中间有一键部署按钮，环境变量讲清取值与获取方式。

---

## 〇、给模板作者：怎么用这份文档（3 步）

1. 在你的 AI 编程助手（CodeBuddy / Cursor / Claude Code 等）里**打开你负责的模板仓库**，确保 AI 能读取仓库代码。
2. 把**本文档整篇**作为上下文丢给 AI，再复制下面 **【一、起手 Prompt】** 整段发给它。
3. AI 会自动读你的仓库代码，生成英文 `README.md` 与中文 `README_zh-CN.md`（两份内容对应、互相链接）。你只需 review 少数标了 `<!-- TODO: confirm -->` 的人工确认项（展示名 / 分类 / 预览图），其余字段都从代码推断填好。

> 你**不需要手写任何额外说明**——起手 Prompt 已包含全部规则。

---

## 一、起手 Prompt（复制即用）

````text
你是一名资深开源项目维护者。请为「当前所在的 EdgeOne Makers Agent 模板仓库」撰写专业的 README，对标 GitHub 上高质量开源仓库。需要产出两份、内容对应：
- README.md：英文（默认）
- README_zh-CN.md：简体中文
两份在标题下都加一行语言切换互链：
- README.md：**Language:** English | [简体中文](./README_zh-CN.md)
- README_zh-CN.md：**语言：** [English](./README.md) | 简体中文

## 第一步：通读当前仓库，从代码提取信息（不要编造）
- edgeone.json：读 agents.framework（映射为框架展示名）、agents.dir。
- 语言：根据入口文件后缀与 package.json / requirements.txt 判断 TypeScript 还是 Python。
- .env.example：提取所有环境变量。
- package.json：取仓库名（用于部署链接的 template= 参数）与运行脚本。
- Agent 入口（agents/<name>/index.*）、tools/ 目录、对话存储与沙箱用法：提炼能力亮点与工作流。
- 路由：从 agents/ 与 cloud-functions/ 下的文件名推断对外路由（文件即路由）。
- 目录树：用于 Project Structure。

## 框架名映射
- claude-sdk → Claude Agent SDK
- openai-sdk → OpenAI Agents SDK
- langgraph → LangGraph
- crewai → CrewAI
- deepagents → Deep Agents
- 无 framework 字段 → None (raw Node/Python)

## 模板档位判断
- Category 为 Quick Start（纯框架 starter）→ 走精简版，可省略 How It Works。
- 其余分类（Coding / Chat / File Processing / Content / Orchestration / Scheduled）→ 走完整版，必须写好 How It Works，且 Overview 更聚焦业务价值。

## 第二步：按以下结构输出（英文版结构，中文版逐节对应翻译）
1. # <展示名>，下一行语言切换互链，再跟一句话描述：做什么 + 基于什么框架 + on EdgeOne Makers。
2. Meta 行：**Framework:** … · **Category:** … · **Language:** …
3. 部署按钮（原样使用，仅替换尖括号）：
   [![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=<仓库名>&from=within&fromAgent=1&agentLang=<typescript|python>)
4. （可选，建议）预览图占位：![preview](./assets/preview.png)
5. ## Overview：2-4 句简介 + 3-5 条 "**能力** — 说明" 形式的 bullet。业务模板的能力要落到业务价值（解决什么问题、典型用法）。
6. ## Environment Variables：一个三列表（Variable | Required | Description），必须包含以下三行：
   - AI_GATEWAY_API_KEY | Yes | Model gateway API key. Use your Makers Models API Key, or any OpenAI-compatible provider key.
   - AI_GATEWAY_BASE_URL | Yes | Gateway base URL. For Makers Models, use https://ai-gateway.edgeone.link/v1.
   - AI_GATEWAY_MODEL | No | Model ID. Defaults to @makers/hy3-preview (a free built-in model).
   表格下补一句：This template follows the OpenAI-compatible standard — point these at Makers Models or any compatible provider.
   随后写小节 "### How to get AI_GATEWAY_API_KEY"，给出四步：
     1) Open the Makers Console (https://console.cloud.tencent.com/edgeone/makers)
     2) Sign in and enable Makers
     3) Go to Makers → Models → API Key and create a key
     4) Copy it into AI_GATEWAY_API_KEY
   说明：内置模型免费限量、适合验证；生产请绑定自费厂商（BYOK）。
   （不要描述环境变量是否"自动注入"——统一只讲如何获取与填写。）
   若代码里还读取 ANTHROPIC_* / DEEPSEEK_* 等兜底变量，再补一小段 "Provider fallbacks" 说明。
7. ## Local Development：列出前置依赖；命令依次为 npm install、cp .env.example .env、edgeone makers dev；并给出本地可观测面板地址 http://localhost:8080/agent-metrics。
8. ## Project Structure：目录树代码块 + "Files prefixed with _ are private modules — not exposed as public routes."
9. ## How It Works（业务模板必写，starter 可省）：把 agent 的端到端流程讲清楚，建议覆盖：
   - 运行模式：agents/ 为会话模式，同 conversation_id 粘性路由到同一实例（用到沙箱时即同一沙箱）。
   - 分步工作流（编号列出：请求入口 → LLM/工具循环 → 关键动作 → 产出/校验/返回）。
   - 用到的工具 / 沙箱 / 对话存储：说明各自承担什么，沙箱凭证由运行时自动注入、无需本地配置。
   - 关键路由（如 /chat）与 conversation_id 的传递方式（请求头 Markers-Conversation-Id）。
   - 相关运行参数（如 edgeone.json 的 agents.timeout、agents.sandbox.timeout）。
10. ## Resources：链接 Makers Agents 文档、Quick Start、Makers Models。
11. ## License。

## 硬性要求
- README.md 全英文、README_zh-CN.md 全中文，两份结构一致；均技术向、无营销腔。
- 不要描述 AI_GATEWAY_* 是否自动注入，只讲如何获取与填写。
- 凡无法从代码推断的（展示名的优雅写法 / Category 分类 / 预览图），给出最合理猜测，并在该处留 <!-- TODO: confirm -->。
- 直接输出 README.md 与 README_zh-CN.md 两份全文，不要额外解释。
````

---

## 二、README 模板（人工参考；AI 输出应与此一致）

````markdown
# {{Template Display Name}}

**Language:** English | [简体中文](./README_zh-CN.md)

> {{One sentence: what this agent does, built with {{Framework}} on EdgeOne Makers.}}

**Framework:** {{OpenAI Agents SDK | Claude Agent SDK | LangGraph | CrewAI | Deep Agents | None (raw Node/Python)}} · **Category:** {{Quick Start | Coding | Chat | File Processing | Content | Orchestration | Scheduled}} · **Language:** {{TypeScript | Python}}

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template={{repo-name}}&from=within&fromAgent=1&agentLang={{typescript|python}})

<!-- Optional but recommended: a screenshot or GIF of the agent in action -->
![preview](./assets/preview.png)

## Overview

{{2-4 sentences: the problem it solves, who it's for, and what makes it notable.}}

- **{{Capability}}** — {{short description}}
- **{{Capability}}** — {{short description}}
- **{{Capability}}** — {{short description}}

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your **Makers Models API Key**, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/hy3-preview` (a free built-in model). |

> This template follows the **OpenAI-compatible** standard — you can point these variables at Makers Models or any other compatible gateway / provider.

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://console.cloud.tencent.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY` (set `AI_GATEWAY_BASE_URL` to `https://ai-gateway.edgeone.link/v1`).

Built-in models (`@makers/deepseek-v4-flash`, `@makers/hy3-preview`, `@makers/minimax-m2.7`) are free and rate-limited — great for prototyping. For production, bind your own provider key (BYOK) in the console.

## Local Development

**Prerequisites:** Node.js, npm{{, Python 3.x for Python templates}}

```bash
npm install
cp .env.example .env
edgeone makers dev
```

Open `http://localhost:8080/agent-metrics` for the local observability panel.

## Project Structure

```text
{{project-tree}}
```

> Files prefixed with `_` are private modules — not exposed as public routes by EdgeOne.

## How It Works
<!-- Business templates: describe the agent workflow / pipeline. Starters may omit this section. -->

{{Brief description of the agent loop, tools, and any sandbox / storage usage.}}

## Resources

- [Makers Agents Documentation]({{docs-link}})
- [Quick Start: Agent Development]({{docs-link}})
- [Makers Models]({{docs-link}})

## License

{{MIT}}
````

> 中文版 `README_zh-CN.md` 逐节对应翻译，标题下语言切换行改为：`**语言：** [English](./README.md) | 简体中文`。

---

## 三、字段填写规范

- **双语**：英文写在 `README.md`、中文写在 `README_zh-CN.md`，标题下加语言切换互链；两份结构一致、逐节对应。
- **标题与一句话描述**：标题用展示名（如 `OpenAI Agents Starter`），非仓库 slug；描述 = 做什么 + 框架 + on EdgeOne Makers，技术向无营销腔。
- **Meta 行**：`Framework` 与控制台卡片框架标签一致，无框架写 `None (raw Node/Python)`；`Category` 取控制台分类；`Language` 为 `TypeScript`/`Python`。
- **Deploy 按钮**：徽章固定 `https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg`，文案统一 `Deploy to EdgeOne Makers`；链接 `https://edgeone.ai/makers/new?template=<仓库名>&from=within&fromAgent=1&agentLang=<typescript|python>`。
- **环境变量（重点）**：标准三件套 `AI_GATEWAY_API_KEY`（必填）/ `AI_GATEWAY_BASE_URL`（必填）/ `AI_GATEWAY_MODEL`（可选，默认 `@makers/hy3-preview`）；基于 OpenAI 兼容标准可自定义；必须保留 "How to get" 小节；**不描述是否自动注入**，只讲获取与填写；仓库需附 `.env.example`，变量名与表格一致。
- **本地开发**：统一 `edgeone makers dev`；Python 模板补 `Python 3.x` 与安装命令。
- **项目结构**：`text` 代码块画目录树，`_` 前缀私有模块要说明。
- **How It Works（业务模板重点）**：starter 可省；业务模板必须写清端到端流程——运行模式与会话粘性、分步工作流、用到的工具/沙箱/对话存储、关键路由与 `conversation_id` 传递、相关运行参数。这是业务模板 README 质量的关键，不能只写一句带过。

---

## 四、填写示例

### 4.1 starter 示例（OpenAI Agents Starter，精简版，省略 How It Works）

````markdown
# OpenAI Agents Starter

**Language:** English | [简体中文](./README_zh-CN.md)

> A streaming chat agent built with the OpenAI Agents SDK on EdgeOne Makers — with custom tools, session memory, and stop-generation.

**Framework:** OpenAI Agents SDK · **Category:** Quick Start · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=openai-agents-starter&from=within&fromAgent=1&agentLang=typescript)

## Overview

A minimal full-stack template that shows how to build a production-shaped chat agent on EdgeOne Makers. Use it as a starting point for assistants that need streaming output, tool calls, and per-conversation memory.

- **SSE Streaming Chat** — token-by-token output with tool-call events
- **Session Memory** — conversation history via `context.store`
- **Custom Tools** — weather, translation, and text-stats examples
- **Stop Generation** — `AbortController` wired end to end

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your Makers Models API Key, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/hy3-preview`. |

> Follows the OpenAI-compatible standard — point these at Makers Models or any compatible provider.

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://console.cloud.tencent.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY`.

Built-in models are free and rate-limited — great for prototyping. For production, bind your own provider key (BYOK) in the console.

## Local Development

**Prerequisites:** Node.js, npm

```bash
npm install
cp .env.example .env
edgeone makers dev
```

Open `http://localhost:8080/agent-metrics` for the local observability panel.

## Project Structure

```text
openai-agents-starter/
├── agents/
│   └── chat/
│       └── index.ts        # Agent entry: model config, tools, run loop, SSE
├── src/                    # Frontend (chat UI)
├── edgeone.json            # Agent runtime configuration
└── package.json
```

## Resources

- [Makers Agents Documentation](https://edgeone.ai/document/agents)
- [Quick Start: Agent Development](https://edgeone.ai/document/agents-quickstart)
- [Makers Models](https://edgeone.ai/document/models)

## License

MIT
````

### 4.2 业务模板示例（Web Dev Agent，完整版，含 How It Works）

> 业务模板的重点是 **Overview 落到业务价值** + **How It Works 把端到端流程讲清**。

````markdown
# Web Dev Agent

**Language:** English | [简体中文](./README_zh-CN.md)

> A sandbox-based web development agent built with the Claude Agent SDK on EdgeOne Makers — describe what you want, and it writes, previews, verifies, and iterates a live web app.

**Framework:** Claude Agent SDK · **Category:** Coding · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=vibe-coding-agent&from=within&fromAgent=1&agentLang=typescript)

![preview](./assets/preview.png)

## Overview

Web Dev Agent turns a natural-language request into a running web app. For each conversation it provisions an isolated sandbox workspace, generates or edits project files, installs dependencies, publishes a live preview, and feeds verification results back into the loop — all inside a single EdgeOne Makers project.

- **Sandbox workspace** — every conversation gets an isolated project under `projects/<conversation_id>/app`
- **Multi-stack generation** — scaffolds and iterates on modern web stacks through the Claude Agent SDK
- **Live preview** — serves the built app via `/preview/` on a public sandbox host
- **Verification & auto-fix** — runs build checks and routes errors back to the agent for repair
- **Chat + files UI** — a front end showing conversation, progress, and a file browser

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your Makers Models API Key, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/hy3-preview`. |

> Follows the OpenAI-compatible standard — point these at Makers Models or any compatible provider. The agent also accepts `ANTHROPIC_*` / `DEEPSEEK_*` as provider fallbacks.

### How to get `AI_GATEWAY_API_KEY`

1. Open the [Makers Console](https://console.cloud.tencent.com/edgeone/makers).
2. Sign in and enable Makers.
3. Go to **Makers → Models → API Key** and create a key.
4. Copy it into `AI_GATEWAY_API_KEY`.

Built-in models are free and rate-limited — great for prototyping. For production, bind your own provider key (BYOK) in the console.

## Local Development

**Prerequisites:** Node.js, npm

```bash
npm install
cp .env.example .env
edgeone makers dev
```

Open `http://localhost:8080/agent-metrics` for the local observability panel.

## Project Structure

```text
vibe-coding-agent/
├── app/                    # Frontend: chat, progress, preview, file browser
├── agents/
│   ├── chat.ts             # /chat route — main agent loop
│   ├── file.ts             # /file route — read sandbox files
│   ├── _agent.ts           # Claude Agent SDK integration
│   ├── _project.ts         # Sandbox project / preview / verification helpers
│   └── tools/              # Custom sandbox tools
├── edgeone.json            # Agent runtime configuration
└── package.json
```

> Files prefixed with `_` are private modules — not exposed as public routes by EdgeOne.

## How It Works

The agent runs as a **session-mode** runtime under `agents/`: requests sharing the same `conversation_id` are routed to the same instance and the same sandbox.

1. **Request** — the front end calls `/chat` with the `Markers-Conversation-Id` header.
2. **Plan & edit** — the Claude Agent SDK drives a tool loop that creates and updates files in the sandbox workspace.
3. **Install & build** — dependencies are installed and the project is built inside the sandbox.
4. **Preview** — the built app is served through `/preview/`; the public URL comes from `context.sandbox.getHost(<port>)`.
5. **Verify & iterate** — build/runtime errors are captured and sent back into the loop for auto-fix.

Sandbox credentials are injected by the runtime automatically — no local sandbox configuration is required. Sandbox lifetime is controlled by `agents.sandbox.timeout` in `edgeone.json`.

## Resources

- [Makers Agents Documentation](https://edgeone.ai/document/agents)
- [Quick Start: Agent Development](https://edgeone.ai/document/agents-quickstart)
- [Makers Models](https://edgeone.ai/document/models)

## License

MIT
````

> 两个范例对应的现有仓库可直接参考：
> - 业务模板：[edgeone-pages-test/vibe-coding-agent](https://github.com/edgeone-pages-test/vibe-coding-agent)（一键部署按钮 + 完整工作流 + 中英双 README）
> - starter：[q153877011/openai-agents-test](https://github.com/q153877011/openai-agents-test)

---

## 五、已确认口径

- **README 双语**：默认英文 `README.md`，附中文 `README_zh-CN.md`，标题下语言切换互链。
- **环境变量不提自动注入**：README 只讲如何获取与填写 `AI_GATEWAY_*`，不描述是否自动注入（注入条件依赖创建方式，理解成本高，统一不写）。
- **edgeone.json 中 sandbox 为嵌套写法** `agents.sandbox.timeout`（非顶层），`timeout` 区间 `300 ~ 3600`，已与官方 Agents 文档对齐。
- **Deploy 链接域名统一用** `edgeone.ai/makers/new`；徽章文案统一 `Deploy to EdgeOne Makers`。
