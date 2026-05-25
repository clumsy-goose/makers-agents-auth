# OpenAI Agents Starter

A full-stack EdgeOne Pages Agent template powered by the OpenAI Agents SDK (TypeScript). Demonstrates how to build a streaming chat Agent with custom tools, session memory, and real-time tool indicators.

## Features

- **SSE Streaming Chat** — Token-by-token `text_delta` push; `tool_called` events when tools are invoked
- **Session Memory** — Persists multi-turn conversation context via EdgeOne `context.store.openaiSession()`
- **Custom Agent Tools** — get_weather, get_clothing_advice, translate_text, text_statistics
- **Stop Generation** — Dual cancellation: frontend `AbortController` + backend `AbortSignal` truly interrupts the LLM call
- **Tool Indicators** — 4 animated lamps light up in real time when the Agent calls a tool

## Directory Structure

```text
openAI-agent-starter/
├── agents/                        # Node/TS backend (EdgeOne Pages Functions)
│   ├── chat/
│   │   └── index.ts              # POST /chat — SSE streaming chat
│   ├── history/
│   │   └── index.ts              # POST /history — conversation history
│   ├── stop/
│   │   └── index.ts              # POST /stop — abort active run
│   ├── _model.ts                 # LLM model config (private module)
│   ├── _logger.ts                # Logger utility (private module)
│   └── _tools.ts                 # Agent tool definitions (private module)
├── src/                           # React frontend (Vite + TypeScript)
│   ├── App.tsx                    # Main app component
│   ├── api.ts                    # Backend API wrappers (SSE streaming)
│   ├── types.ts                  # Type definitions
│   └── components/               # UI components
│       ├── ChatWindow.tsx        # Chat window
│       ├── ChatBubble.tsx        # Message bubble (Markdown support)
│       ├── ChatInput.tsx         # Input box + presets + stop button
│       ├── CodeViewer.tsx        # Code display panel (CRT aesthetic)
│       ├── ToolIndicators.tsx    # Tool indicator container
│       └── ToolLamp.tsx          # Single tool indicator lamp
├── index.html                    # Entry HTML
├── package.json                  # Dependencies (includes @openai/agents)
├── vite.config.ts                # Vite config
├── tsconfig.json                 # TypeScript config
└── .gitignore                    # Git ignore rules
```

> Files prefixed with `_` are private modules — not mapped as public routes by EdgeOne.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | LLM API key |
| `AI_GATEWAY_BASE_URL` | Yes | LLM API base URL (OpenAI-compatible) |
| `AI_GATEWAY_MODEL` | No | Model name (default: `@Pages/hy3-preview`) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | SSE streaming chat. Header: `pages-agent-conversation-id` |
| `/stop` | POST | Abort the active agent run. Body: `{ "conversation_id": "..." }` |
| `/history` | POST | Get conversation history. Header: `pages-agent-conversation-id` |

### SSE Events

```
event: text_delta     data: {"delta":"Hello"}
event: tool_called    data: {"tool":"get_weather"}
event: ping           data: {"ts":1710000000000}
event: error          data: {"message":"..."}
event: done           data: {"stopped":false}
```

## Architecture

### Backend (`agents/`)

1. **`createLlmModel(context.env)`** — Creates OpenAI Agents SDK model from environment config
2. **`createTools()`** — Returns the list of custom Agent tools (weather, clothing, translate, statistics)
3. **`context.store.openaiSession(conversationId)`** — Provides session persistence for multi-turn memory
4. **`run(agent, message, { session, stream, signal })`** — Launches the Agent with streaming output
5. **SSE output** — Yields `text_delta`, `tool_called`, `done`, `error` events

### Frontend (`src/`)

- `App.tsx` — Orchestrates chat panel + code viewer, manages SSE stream
- `api.ts` — SSE parsing, dispatches `onTextDelta`, `onToolCalled`, `onDone`, `onError`
- `components/CodeViewer.tsx` — Static code display panel (amber CRT aesthetic) showing the agent flow
- `components/ToolIndicators.tsx` — Animated tool lamps that flash when tools are called

## Local Development

```bash
# Install dependencies
npm install

# Start EdgeOne local dev (frontend + backend)
edgeone pages dev
```
