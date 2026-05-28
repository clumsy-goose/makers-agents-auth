# OpenAI Agents Starter

基于 OpenAI Agents SDK (TypeScript) 的 EdgeOne Pages Agent 全栈项目模板。演示如何构建一个支持流式聊天、自定义工具、会话记忆和工具指示灯的 Agent。

## 功能

- **SSE 流式聊天** — 逐 token 推送 `text_delta`，命中工具时推送 `tool_called`
- **会话记忆** — 通过 EdgeOne `context.store.openaiSession()` 持久化多轮对话上下文
- **自定义 Agent 工具** — get_weather、get_clothing_advice、translate_text、text_statistics
- **停止生成** — 前端 `AbortController` + 后端 `AbortSignal` 双重取消机制，真正中断 LLM 调用
- **工具灯状态** — 4 个动画指示灯，Agent 调用工具时实时点亮

## 目录结构

```text
openAI-agent-starter/
├── agents/                        # Node/TS 后端（EdgeOne Pages Functions）
│   ├── chat/
│   │   └── index.ts              # POST /chat — SSE 流式聊天
│   ├── history/
│   │   └── index.ts              # POST /history — 对话历史
│   ├── stop/
│   │   └── index.ts              # POST /stop — 中断 agent
│   ├── _model.ts                 # LLM 模型配置（私有模块）
│   ├── _logger.ts                # 日志工具（私有模块）
│   └── _tools.ts                 # Agent 工具定义（私有模块）
├── src/                           # React 前端（Vite + TypeScript）
│   ├── App.tsx                    # 主应用组件
│   ├── api.ts                    # 后端 API 封装（SSE 流式调用）
│   ├── types.ts                  # 类型定义
│   └── components/               # UI 组件
│       ├── ChatWindow.tsx        # 聊天窗口
│       ├── ChatBubble.tsx        # 消息气泡（支持 Markdown）
│       ├── ChatInput.tsx         # 输入框 + 预设 + 停止按钮
│       ├── CodeViewer.tsx        # 代码展示面板（CRT 风格）
│       ├── ToolIndicators.tsx    # 工具指示灯容器
│       └── ToolLamp.tsx          # 单个工具指示灯
├── index.html                    # 入口 HTML
├── package.json                  # 项目依赖（含 @openai/agents）
├── vite.config.ts                # Vite 配置
├── tsconfig.json                 # TypeScript 配置
└── .gitignore                    # Git 忽略规则
```

> 以 `_` 开头的文件是私有模块，不会被 EdgeOne 映射为公开路由。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_GATEWAY_API_KEY` | 是 | LLM API 密钥 |
| `AI_GATEWAY_BASE_URL` | 是 | LLM API 地址（OpenAI 兼容） |
| `AI_GATEWAY_MODEL` | 否 | 模型名称（默认 `@makers/hy3-preview`） |

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/chat` | POST | SSE 流式聊天，Header 带 `makers-conversation-id` |
| `/stop` | POST | 中断正在执行的 agent，Body 传 `{ "conversation_id": "..." }` |
| `/history` | POST | 获取对话历史，Header 带 `makers-conversation-id` |

### SSE 事件

```
event: text_delta     data: {"delta":"你好"}
event: tool_called    data: {"tool":"get_weather"}
event: ping           data: {"ts":1710000000000}
event: error          data: {"message":"..."}
event: done           data: {"stopped":false}
```

## 架构

### 后端（`agents/`）

1. **`createLlmModel(context.env)`** — 从环境配置创建 OpenAI Agents SDK 模型
2. **`createTools()`** — 返回自定义 Agent 工具列表（天气、穿衣、翻译、统计）
3. **`context.store.openaiSession(conversationId)`** — 提供 session 持久化，用于多轮对话记忆
4. **`run(agent, message, { session, stream, signal })`** — 启动 Agent 并流式输出
5. **SSE 输出** — 依次 yield `text_delta`、`tool_called`、`done`、`error` 事件

### 前端（`src/`）

- `App.tsx` — 编排聊天面板 + 代码查看器，管理 SSE 流
- `api.ts` — SSE 解析，分发 `onTextDelta`、`onToolCalled`、`onDone`、`onError`
- `components/CodeViewer.tsx` — 静态代码展示面板（琥珀 CRT 风格），展示 Agent 创建流程
- `components/ToolIndicators.tsx` — 模型调用工具时的动画指示灯

## 本地开发

```bash
# 安装依赖
npm install

# 启动 EdgeOne 本地开发（前后端同时启动）
edgeone pages dev
```
