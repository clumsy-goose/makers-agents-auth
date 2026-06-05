/**
 * Backend API (EdgeOne Makers)
 *
 * Route mapping (file → route):
 *   agents/chat/index.ts                → POST /chat     Main chat endpoint
 *   agents/stop/index.ts                → POST /stop     Abort the active agent run
 *   cloud-functions/history/index.ts    → POST /history  Get conversation history
 *   cloud-functions/auth/login          → POST /auth/login
 *   cloud-functions/auth/register       → POST /auth/register
 *   cloud-functions/auth/me             → GET  /auth/me
 *   cloud-functions/auth/logout         → POST /auth/logout
 *
 * This file defines all API paths and request wrappers.
 */

import type { Message } from './types';

export const API = {
  chat: '/chat',
  chatStop: '/stop',
  history: '/history',
  authLogin: '/auth/login',
  authRegister: '/auth/register',
  authMe: '/auth/me',
  authLogout: '/auth/logout',
} as const;

// ── Auth helpers ──────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
}

/** 401 时统一抛出此错误,UI 层捕获后跳登录页 */
export class AuthRequiredError extends Error {
  constructor() {
    super('auth_required');
    this.name = 'AuthRequiredError';
  }
}

/** 通用 401 探测 — 任何业务请求拿到 401 都视为登录失效 */
function check401<T extends Response>(res: T): T {
  if (res.status === 401) {
    // 通知全局监听者(App 会订阅此事件)
    window.dispatchEvent(new CustomEvent('eo:auth-required'));
    throw new AuthRequiredError();
  }
  return res;
}

// ── Auth Chain Trace 事件 ────────────────────────────────────
// AuthChainTrace 组件订阅以下 6 个 CustomEvent,实时点亮链路节点。
// 命名:eo:trace:{phase}, detail 携带 traceId + ts 用于多请求并发去重 / 时延计算。

export type TracePhase =
  | 'request-start'    // fetch 发起 — Browser 节点亮
  | 'mw-pass'          // 收到 HTTP 响应(200) — Middleware 节点亮(401 永远走不到这)
  | 'agent-verified'   // Agent emit auth_ok — Agent 节点亮
  | 'neon-start'       // Agent 开始查 Neon(neon_query_start)— Neon 节点 pending→active
  | 'neon-done'        // Agent 查完 Neon(neon_query_done) — Neon 节点 done(含 rows / ms)
  | 'first-delta'      // 第一个 text_delta — Response 节点亮
  | 'complete'         // done 事件 — 整链路完成
  | 'error';           // 失败 — 当前进展节点标红

interface TraceEventDetail {
  traceId: string;
  phase: TracePhase;
  ts: number;
  status?: number;     // 仅 mw-pass / error 时有
  reason?: string;     // 仅 error 时有
  meta?: Record<string, unknown>;
}

function emitTrace(detail: TraceEventDetail): void {
  window.dispatchEvent(new CustomEvent<TraceEventDetail>('eo:trace', { detail }));
}

export type { TraceEventDetail };

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(API.authLogin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `login_failed_${res.status}`);
  }
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

export async function register(username: string, password: string): Promise<AuthUser> {
  const res = await fetch(API.authRegister, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `register_failed_${res.status}`);
  }
  const data = await res.json() as { user: AuthUser };
  return data.user;
}

/** 探测当前是否已登录 — 失败返回 null,UI 据此渲染登录页或聊天页 */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(API.authMe, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json() as { user?: AuthUser };
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch(API.authLogout, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined);
}

// ── Original API ──────────────────────────────────────────────

export interface RawSseEvent {
  eventType: string;
  data: unknown;
  raw: string;
  timestamp: number;
}

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onToolCalled: (toolName: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  onRawEvent?: (event: RawSseEvent) => void;
}

/** Get conversation history for restoring the chat window after page refresh. */
export async function fetchConversationHistory(conversationId: string): Promise<Message[]> {
  const startTime = Date.now();
  console.log(`[History] Request start time: ${new Date(startTime).toLocaleString()}`);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API.history, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
        credentials: 'include',
      });

      // 401 = 登录失效,统一处理
      if (res.status === 401) {
        check401(res);
      }

      // 409 = Active request on same conversation (React StrictMode double-render), retry shortly
      if (res.status === 409) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      if (!res.ok) {
        const endTime = Date.now();
        console.log(`[History] Request end time: ${new Date(endTime).toLocaleString()}`);
        console.log(`[History] Total time: ${endTime - startTime}ms`);
        return [];
      }

      const data = await res.json().catch(() => null) as { messages?: Message[] } | null;
      const endTime = Date.now();
      console.log(`[History] Request end time: ${new Date(endTime).toLocaleString()}`);
      console.log(`[History] Total time: ${endTime - startTime}ms`);
      return Array.isArray(data?.messages) ? data.messages : [];
    } catch {
      const endTime = Date.now();
      console.log(`[History] Request end time: ${new Date(endTime).toLocaleString()}`);
      console.log(`[History] Total time: ${endTime - startTime}ms (aborted with error)`);
      return [];
    }
  }

  const endTime = Date.now();
  console.log(`[History] Request end time: ${new Date(endTime).toLocaleString()}`);
  console.log(`[History] Total time: ${endTime - startTime}ms (retries exhausted)`);
  return [];
}

/**
 * Stream POST /chat via SSE
 * Backend pushes events: text_delta / tool_called / done / error
 *
 * Returns an AbortController the caller can use to abort (or pair with /chat/stop for graceful abort).
 */
export function sendMessageStream(
  message: string,
  callbacks: StreamCallbacks,
  conversationId?: string,
): AbortController {
  const ctrl = new AbortController();
  // 每次请求一个 traceId,便于 AuthChainTrace 跟踪并发或快速连发
  const traceId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let firstDeltaSeen = false;

  emitTrace({ traceId, phase: 'request-start', ts: Date.now() });

  (async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (conversationId) {
        headers['makers-conversation-id'] = conversationId;
      }

      const res = await fetch(API.chat, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
        signal: ctrl.signal,
        credentials: 'include',
      });

      if (res.status === 401) {
        emitTrace({ traceId, phase: 'error', ts: Date.now(), status: 401, reason: 'middleware rejected' });
        check401(res);
      }

      // 走到这里说明 HTTP 状态已下来,且不是 401 — middleware 已 next() 放行
      emitTrace({ traceId, phase: 'mw-pass', ts: Date.now(), status: res.status });

      if (!res.ok) {
        emitTrace({ traceId, phase: 'error', ts: Date.now(), status: res.status });
        callbacks.onError(new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError(new Error('ReadableStream not supported'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE format: events separated by \n\n
        const parts = buffer.split('\n\n');
        // Last segment may be incomplete — keep in buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          dispatchSseChunk(
            part,
            callbacks,
            () => { doneReceived = true; },
            (eventType, parsed) => {
              // 把 SSE 信号映射到 trace phase
              if (eventType === 'auth_ok') {
                emitTrace({ traceId, phase: 'agent-verified', ts: Date.now(), meta: parsed as Record<string, unknown> });
              } else if (eventType === 'neon_query_start') {
                emitTrace({ traceId, phase: 'neon-start', ts: Date.now(), meta: parsed as Record<string, unknown> });
              } else if (eventType === 'neon_query_done') {
                emitTrace({ traceId, phase: 'neon-done', ts: Date.now(), meta: parsed as Record<string, unknown> });
              } else if (eventType === 'text_delta' && !firstDeltaSeen) {
                firstDeltaSeen = true;
                emitTrace({ traceId, phase: 'first-delta', ts: Date.now() });
              } else if (eventType === 'done') {
                emitTrace({ traceId, phase: 'complete', ts: Date.now() });
              } else if (eventType === 'error') {
                emitTrace({ traceId, phase: 'error', ts: Date.now(), reason: (parsed as { message?: string })?.message });
              }
            },
          );
        }
      }

      // Fallback: trigger done only if backend did not send done event
      if (!doneReceived) {
        emitTrace({ traceId, phase: 'complete', ts: Date.now() });
        callbacks.onDone();
      }
    } catch (err) {
      // AbortError does not trigger error callback
      if (err instanceof DOMException && err.name === 'AbortError') return;
      emitTrace({ traceId, phase: 'error', ts: Date.now(), reason: (err as Error)?.message });
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return ctrl;
}

/** Parse a single SSE event and dispatch to the corresponding callback */
function dispatchSseChunk(
  part: string,
  cb: StreamCallbacks,
  markDone: () => void,
  onSignal?: (eventType: string, parsed: unknown) => void,
): void {
  let eventType = '';
  let data = '';

  for (const line of part.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!eventType || !data) return;

  try {
    const parsed = JSON.parse(data);

    if (cb.onRawEvent) {
      cb.onRawEvent({
        eventType,
        data: parsed,
        raw: data,
        timestamp: Date.now(),
      });
    }

    onSignal?.(eventType, parsed);

    switch (eventType) {
      case 'text_delta':
        cb.onTextDelta(parsed.delta);
        break;
      case 'tool_called':
        cb.onToolCalled(parsed.tool);
        break;
      case 'error':
        cb.onError(new Error(parsed.message || 'agent returned error'));
        break;
      case 'done':
        markDone();
        cb.onDone();
        break;
      // 'auth_ok' 不需要回调,只用于 onSignal trace
    }
  } catch {
    if (cb.onRawEvent) {
      cb.onRawEvent({
        eventType,
        data: null,
        raw: data,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Request the backend to abort the currently running agent
 * 对应 agents/chat/stop.py → POST /chat/stop
 *
 * Note: the stop request header must NOT carry the same conversation_id as chat,
 * otherwise the runtime will overwrite chat's cancel_event with stop's cancel_event,
 * causing abort_active_run to fail. The target conversation_id is passed only via body.
 */
export async function stopAgent(conversationId?: string): Promise<boolean> {
  try {
    const res = await fetch(API.chatStop, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId }),
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
