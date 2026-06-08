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

/** 派发全局 401 信号 — AuthGate 监听后弹登录窗 */
function dispatchAuthRequired(): void {
  window.dispatchEvent(new CustomEvent('eo:auth-required'));
}

/** 通用 401 探测 — 任何业务请求拿到 401 都视为登录失效(抛错版,适合非流式调用) */
function check401<T extends Response>(res: T): T {
  if (res.status === 401) {
    dispatchAuthRequired();
    throw new AuthRequiredError();
  }
  return res;
}

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
  /**
   * 401 时(登录失效)优先调用,onError 不会再触发。
   * 上层据此清理乐观插入的占位气泡,而不必把它当作"请求失败"展示。
   */
  onAuthRequired?: () => void;
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
        // 登录失效:派发全局事件让 AuthGate 弹登录窗,
        // 调用 onAuthRequired 让上层清理占位气泡,然后直接退出 —
        // 不走 onError,避免在聊天窗里展示"请求失败"误导用户。
        dispatchAuthRequired();
        callbacks.onAuthRequired?.();
        return;
      }

      if (!res.ok) {
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
          );
        }
      }

      // Fallback: trigger done only if backend did not send done event
      if (!doneReceived) {
        callbacks.onDone();
      }
    } catch (err) {
      // AbortError does not trigger error callback
      if (err instanceof DOMException && err.name === 'AbortError') return;
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
      // auth_ok / neon_query_start / neon_query_done 仅经 onRawEvent 进 DebugPanel,
      // 不再触发任何前端动效或链路高亮。
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
