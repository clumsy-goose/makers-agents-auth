/**
 * AuthChainTrace — 实时鉴权链路追踪
 * ================================
 *
 * 监听 window 上的 'eo:trace' CustomEvent(由 src/api.ts 派发),
 * 把每条聊天消息的请求生命周期映射到 4 节点链路:
 *
 *   ① Browser    fetch() 发起          (request-start)
 *   ② Middleware 收到 HTTP 响应         (mw-pass)        ← 401 永远走不到这一步
 *   ③ Agent      auth_ok SSE 事件       (agent-verified) ← Agent 独立验签生效证明
 *   ④ Response   首个 text_delta        (first-delta)
 *
 * 状态机:idle → pending → active → done(每个节点)
 * 整体:idle → tracing → complete | error  → 1.6s 后自动 reset 回 idle
 *
 * 设计要点:
 *   - 真实信号驱动,不是动画占位 — 后端没回 auth_ok 节点就不会亮
 *   - traceId 隔离并发请求(连发场景下旧 trace 不污染新 trace)
 *   - 多终止状态保护:complete / error / 5s 超时 — 都会触发 auto-reset
 */

import { useEffect, useReducer } from 'react';
import { useT } from '../i18n';
import type { TraceEventDetail } from '../api';
import styles from './AuthChainTrace.module.css';

type NodeKey = 'browser' | 'middleware' | 'agent' | 'neon' | 'response';
type NodeStatus = 'idle' | 'pending' | 'active' | 'done' | 'error';

interface NodeState {
  status: NodeStatus;
  /** 该节点点亮的时间戳(ms),用来算累计耗时 */
  ts?: number;
  /** Neon 专用:查询行数 / 时延(ms) */
  rows?: number;
  ms?: number;
}

interface TraceState {
  traceId: string | null;
  startTs: number | null;
  endTs: number | null;
  /** 整链路状态 */
  phase: 'idle' | 'tracing' | 'complete' | 'error';
  errorReason?: string;
  nodes: Record<NodeKey, NodeState>;
}

const INITIAL_NODES: Record<NodeKey, NodeState> = {
  browser:    { status: 'idle' },
  middleware: { status: 'idle' },
  agent:      { status: 'idle' },
  neon:       { status: 'idle' },
  response:   { status: 'idle' },
};

const INITIAL_STATE: TraceState = {
  traceId: null,
  startTs: null,
  endTs: null,
  phase: 'idle',
  nodes: INITIAL_NODES,
};

type Action =
  | { kind: 'reset' }
  | { kind: 'event'; payload: TraceEventDetail };

function reducer(state: TraceState, action: Action): TraceState {
  if (action.kind === 'reset') return INITIAL_STATE;

  const { traceId, phase, ts, reason } = action.payload;

  // request-start 总是开启一个新 trace(覆盖旧的)
  if (phase === 'request-start') {
    return {
      traceId,
      startTs: ts,
      endTs: null,
      phase: 'tracing',
      nodes: {
        browser:    { status: 'active', ts },
        middleware: { status: 'pending' },
        agent:      { status: 'idle' },
        neon:       { status: 'idle' },
        response:   { status: 'idle' },
      },
    };
  }

  // 后续事件必须 traceId 匹配,否则丢弃(防过期请求污染)
  if (state.traceId !== traceId) return state;

  switch (phase) {
    case 'mw-pass':
      return {
        ...state,
        nodes: {
          ...state.nodes,
          browser:    { ...state.nodes.browser, status: 'done' },
          middleware: { status: 'active', ts },
          agent:      { status: 'pending' },
        },
      };
    case 'agent-verified':
      return {
        ...state,
        nodes: {
          ...state.nodes,
          middleware: { ...state.nodes.middleware, status: 'done' },
          agent:      { status: 'active', ts },
          neon:       { status: 'pending' },
        },
      };
    case 'neon-start':
      return {
        ...state,
        nodes: {
          ...state.nodes,
          agent: { ...state.nodes.agent, status: 'done' },
          neon:  { status: 'active', ts },
        },
      };
    case 'neon-done': {
      const meta = action.payload.meta ?? {};
      const ok = meta.ok !== false;
      const rows = typeof meta.rows === 'number' ? meta.rows : undefined;
      const ms = typeof meta.ms === 'number' ? meta.ms : undefined;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          neon: ok
            ? { status: 'done', ts, rows, ms }
            : { status: 'error', ts, ms },
          response: { status: 'pending' },
        },
      };
    }
    case 'first-delta':
      return {
        ...state,
        nodes: {
          ...state.nodes,
          // neon 可能已 done(显式)或 idle(降级 — 极端情况);此处不强制改
          response: { status: 'active', ts },
        },
      };
    case 'complete':
      return {
        ...state,
        endTs: ts,
        phase: 'complete',
        nodes: {
          browser:    { ...state.nodes.browser,    status: 'done' },
          middleware: { ...state.nodes.middleware, status: 'done' },
          agent:      { ...state.nodes.agent,      status: 'done' },
          neon:       state.nodes.neon.status === 'error'
                        ? state.nodes.neon
                        : { ...state.nodes.neon, status: 'done' },
          response:   { ...state.nodes.response,   status: 'done' },
        },
      };
    case 'error': {
      // 把"当前 active 或最近 active 的节点"标 error,其余维持
      const order: NodeKey[] = ['browser', 'middleware', 'agent', 'neon', 'response'];
      const nodes: Record<NodeKey, NodeState> = { ...state.nodes };
      let foundActive = false;
      for (const k of order) {
        if (nodes[k].status === 'active' || nodes[k].status === 'pending') {
          nodes[k] = { ...nodes[k], status: 'error' };
          foundActive = true;
          break;
        }
      }
      if (!foundActive) {
        nodes.browser = { ...nodes.browser, status: 'error' };
      }
      return {
        ...state,
        endTs: ts,
        phase: 'error',
        errorReason: reason,
        nodes,
      };
    }
    default:
      return state;
  }
}

const NODE_ORDER: NodeKey[] = ['browser', 'middleware', 'agent', 'neon', 'response'];
const NODE_LABEL_KEYS: Record<NodeKey, [`trace.node.${NodeKey}`, `trace.node.${NodeKey}.note`]> = {
  browser:    ['trace.node.browser',    'trace.node.browser.note'],
  middleware: ['trace.node.middleware', 'trace.node.middleware.note'],
  agent:      ['trace.node.agent',      'trace.node.agent.note'],
  neon:       ['trace.node.neon',       'trace.node.neon.note'],
  response:   ['trace.node.response',   'trace.node.response.note'],
};

export default function AuthChainTrace() {
  const { t } = useT();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // 订阅 trace 事件
  useEffect(() => {
    const onTrace = (e: Event) => {
      const detail = (e as CustomEvent<TraceEventDetail>).detail;
      if (detail) dispatch({ kind: 'event', payload: detail });
    };
    window.addEventListener('eo:trace', onTrace);
    return () => window.removeEventListener('eo:trace', onTrace);
  }, []);

  // complete / error 后自动 reset(给用户 1.8s 看完最终态再回到 idle)
  useEffect(() => {
    if (state.phase === 'complete' || state.phase === 'error') {
      const id = window.setTimeout(() => dispatch({ kind: 'reset' }), 1800);
      return () => window.clearTimeout(id);
    }
    // 兜底:tracing 状态超过 60s 还没结束 → 强制 reset(防卡死)
    if (state.phase === 'tracing') {
      const id = window.setTimeout(() => dispatch({ kind: 'reset' }), 60_000);
      return () => window.clearTimeout(id);
    }
    return;
  }, [state.phase]);

  // 进度条宽度:已 done 的节点数 / 4(5 节点 = 4 段连线)
  const progressPct = (() => {
    const doneCount = NODE_ORDER.filter(k => state.nodes[k].status === 'done').length;
    if (state.phase === 'idle') return 0;
    if (state.phase === 'complete') return 100;
    return Math.min(100, (doneCount / 4) * 100);
  })();

  const totalMs = (() => {
    if (!state.startTs) return null;
    const end = state.endTs ?? (state.phase === 'tracing' ? Date.now() : null);
    if (!end) return null;
    return end - state.startTs;
  })();

  const statusText = (() => {
    if (state.phase === 'idle') return t('trace.idle');
    if (state.phase === 'complete') return t('trace.complete');
    if (state.phase === 'error') return state.errorReason
      ? `${t('trace.error')} · ${state.errorReason}`
      : t('trace.error');
    return t('trace.streaming');
  })();

  const statusClass =
    state.phase === 'complete' ? styles.statusDone
    : state.phase === 'error'  ? styles.statusError
    : state.phase === 'tracing' ? styles.statusActive
    : '';

  const barClass =
    state.phase === 'tracing' || state.phase === 'complete' ? styles.barActive
    : state.phase === 'error' ? styles.barError
    : '';

  return (
    <div className={`${styles.bar} ${barClass}`} role="status" aria-live="polite">
      <div className={styles.label}>
        <span className={styles.title}>{t('trace.title')}</span>
        <span className={`${styles.status} ${statusClass}`}>{statusText}</span>
      </div>

      <div className={styles.chain}>
        {/* 进度连线 — 跨 5 个节点之间的 4 段间隙(节点 dot 中心 = 各自 1/5 区中点),
            连线从第 1 个节点中心 (10%) 延伸到第 5 个节点中心 (90%) = 80% 宽 */}
        <span
          className={`${styles.progress} ${state.phase === 'error' ? styles.progressError : ''}`}
          style={{ width: `calc(80% * ${progressPct / 100})` }}
        />
        {NODE_ORDER.map((k) => {
          const node = state.nodes[k];
          const [labelKey, noteKey] = NODE_LABEL_KEYS[k];
          const dotClass =
            node.status === 'pending' ? styles.dotPending
            : node.status === 'active' ? styles.dotActive
            : node.status === 'done'   ? styles.dotDone
            : node.status === 'error'  ? styles.dotError
            : styles.dotIdle;
          // Neon 节点用 emerald 色调,与 Agent 节点视觉区分
          const nodeKindClass = k === 'neon' ? styles.nodeNeon : '';
          const revealed = node.status === 'active' || node.status === 'done';

          // Neon 节点完成后,note 用真实 rows · ms 替换静态文案
          let displayNote: string;
          if (k === 'neon' && (node.status === 'done' || node.status === 'error') && typeof node.ms === 'number') {
            displayNote = node.status === 'error'
              ? `error · ${node.ms}ms`
              : `${node.rows ?? 0} row · ${node.ms}ms`;
          } else {
            displayNote = t(noteKey);
          }

          return (
            <div key={k} className={`${styles.node} ${nodeKindClass} ${revealed ? styles.nodeRevealed : ''}`}>
              <span className={`${styles.dot} ${dotClass}`} aria-hidden>
                {(node.status === 'active' || node.status === 'done') && (
                  k === 'neon' ? <DbIcon /> : <CheckIcon />
                )}
                {node.status === 'error' && <XIcon />}
              </span>
              <span className={styles.nodeLabel}>{t(labelKey)}</span>
              <span className={styles.nodeNote}>{displayNote}</span>
            </div>
          );
        })}
      </div>

      <div className={`${styles.timing}
                       ${state.phase === 'complete' ? styles.timingActive : ''}
                       ${state.phase === 'error' ? styles.timingError : ''}`}>
        {totalMs !== null ? (
          <>
            <strong>{formatMs(totalMs)}</strong>
            <span>· e2e</span>
          </>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5L9.5 18 20 7" />
    </svg>
  );
}
function DbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
      <path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
