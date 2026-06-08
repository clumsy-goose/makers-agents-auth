import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, ToolLampState } from './types';
import { fetchConversationHistory, sendMessageStream, stopAgent } from './api';
import type { RawSseEvent } from './api';
import ToolIndicators from './components/ToolIndicators';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import DebugPanel from './components/DebugPanel';
import CodeViewer from './components/CodeViewer';
import { I18nProvider, LangToggle, useT, MessageKeys } from './i18n';
import { deleteSnapshot, loadSnapshot, saveSnapshot } from './lib/chatUiStore';
import AuthGate, { useAuthGate } from './auth/AuthGate';
import UserPill from './auth/UserPill';
import SignInButton from './auth/SignInButton';
import styles from './App.module.css';

const LAMP_IDS = ['get_weather', 'get_clothing_advice', 'translate_text', 'text_statistics'] as const;
const LAMP_ICONS: Record<string, string> = {
  get_weather: '☀️',
  get_clothing_advice: '👔',
  translate_text: '🌐',
  text_statistics: '📊',
};
const LAMP_I18N_KEYS: Record<string, string> = {
  get_weather: 'tool.weather',
  get_clothing_advice: 'tool.clothing',
  translate_text: 'tool.translate',
  text_statistics: 'tool.statistics',
};

const CONVERSATION_ID_STORAGE_KEY = 'eo_conversation_id';

/** Returns existing conversation ID from localStorage, or null if first visit */
function getExistingConversationId(): string | null {
  return localStorage.getItem(CONVERSATION_ID_STORAGE_KEY);
}

/** Returns existing or creates a new conversation ID */
function getOrCreateConversationId(): string {
  const cached = getExistingConversationId();
  if (cached) return cached;

  const conversationId = crypto.randomUUID();
  localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, conversationId);
  return conversationId;
}

// Module-level dedup flag — outside React lifecycle, unaffected by StrictMode
let _historyFetchInFlight = false;

export default function App() {
  return (
    <I18nProvider>
      <LangToggle />
      <AuthGate>
        <AppShell />
      </AuthGate>
    </I18nProvider>
  );
}

/**
 * AppShell — 在 AuthGate 上下文内,根据登录状态选择头部右侧的 pill 形态。
 *   authed → UserPill(用户徽章 + 账户菜单)
 *   guest  → SignInButton(主动唤起登录弹窗)
 * 主体 AppInner 永远渲染 — 未登录用户也能看到 homepage,
 * 仅在调用受保护接口时才会触发 401 → 自动弹窗。
 */
function AppShell() {
  const { user, signOut, openSignIn } = useAuthGate();
  return (
    <>
      {user
        ? <UserPill user={user} onSignOut={signOut} />
        : <SignInButton onClick={openSignIn} />}
      <AppInner isAuthed={user !== null} />
    </>
  );
}

interface AppInnerProps {
  isAuthed: boolean;
}

function AppInner({ isAuthed }: AppInnerProps) {
  const { t } = useT();
  const buildLamps = useCallback((): ToolLampState[] =>
    LAMP_IDS.map(id => ({
      id,
      label: t(LAMP_I18N_KEYS[id] as MessageKeys),
      icon: LAMP_ICONS[id],
      active: false,
      animKey: 0,
    })),
  [t]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [lamps, setLamps]       = useState<ToolLampState[]>(buildLamps);
  const [loading, setLoading]   = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [debugEvents, setDebugEvents] = useState<RawSseEvent[]>([]);
  const [rightPanelMode, setRightPanelMode] = useState<'code' | 'debug'>('code');

  const botMsgIdRef = useRef<string>('');
  const abortCtrlRef = useRef<AbortController | null>(null);
  const hadExistingConversationIdRef = useRef(getExistingConversationId() !== null);
  const conversationIdRef = useRef<string>(getOrCreateConversationId());
  const initDoneRef = useRef(false);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 401 时把"待重发"的消息文本暂存,登录成功后(isAuthed false→true)自动续上重发。
   * 带时间戳是为了给"陈年缓存"加保护伞:用户 401 后没登录,过几小时回来再开
   * 弹窗登录,不应该把当时的提问突然回放出来。
   */
  const pendingMessageRef = useRef<{ text: string; ts: number } | null>(null);
  const prevIsAuthedRef = useRef<boolean>(isAuthed);
  const PENDING_TTL_MS = 5 * 60 * 1000;

  // Update lamp labels when language changes
  useEffect(() => {
    setLamps(prev =>
      prev.map(l => ({
        ...l,
        label: t(LAMP_I18N_KEYS[l.id] as MessageKeys),
      }))
    );
  }, [t]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!initDoneRef.current) return;

    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      saveSnapshot(conversationIdRef.current, messages).catch(err => {
        console.warn('[chatUiStore] snapshot save failed:', err);
      });
    }, 500);

    return () => {
      if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    };
  }, [messages]);

  useEffect(() => {
    // 访客模式不拉历史 — /history 是受保护接口,直接探测会触发 401 → 自动弹窗,
    // 这对未登录浏览首页的体验是种打扰。等用户主动登录后再拉。
    if (!isAuthed) {
      setHistoryLoading(false);
      return;
    }

    // 有"401 后待重发"任务时,跳过 history / snapshot 加载。否则:
    //   401 清场后,messages = [userMsg],snapshot effect 防抖 500ms 后落盘成 [userMsg]。
    //   登录耗时通常 > 500ms,等用户登录成功 isAuthed flip 时,这条脏 snapshot 已落盘。
    //   两个 effect 同时触发:retry 同步推 botMsg + 流式填内容,
    //   restoreSnapshot 异步晚到 setMessages([userMsg]) 把流式 bot 整个冲掉。
    // 跳过的代价:
    //   - 新注册用户:本来就没 server 历史,无损失
    //   - 重新登录的老用户:历史本就在 messages state 里(401 前已加载完),也无损失
    if (pendingMessageRef.current) {
      setHistoryLoading(false);
      return;
    }

    // First visit: no existing conversation → skip history fetch for instant load
    if (!hadExistingConversationIdRef.current) {
      setHistoryLoading(false);
      return;
    }

    const convId = conversationIdRef.current;
    let restoredFromSnapshot = false;
    let snapshotMessageCount = 0;

    const restoreSnapshot = () => loadSnapshot(convId).then(snapshot => {
      snapshotMessageCount = snapshot.length;
      if (snapshot.length > 0) {
        restoredFromSnapshot = true;
        setMessages(snapshot);
        setHistoryLoading(false);
      }
    }).catch(() => {});

    if (_historyFetchInFlight) {
      restoreSnapshot().finally(() => setHistoryLoading(false));
      return;
    }
    _historyFetchInFlight = true;

    restoreSnapshot().finally(() => {
      fetchConversationHistory(convId).then(history => {
        if (history.length > 0) {
          if (!restoredFromSnapshot || history.length > snapshotMessageCount) {
            setMessages(history);
          }
          saveSnapshot(convId, history).catch(() => {});
        }
      }).finally(() => {
        _historyFetchInFlight = false;
        setHistoryLoading(false);
      });
    });
  }, [isAuthed]);

  /** Update the current bot message's content via an updater function. */
  const updateBotMessage = useCallback((updater: (content: string) => string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === botMsgIdRef.current
          ? { ...m, content: updater(m.content) }
          : m
      )
    );
  }, []);

  const finishStream = useCallback(() => {
    setLoading(false);
    abortCtrlRef.current = null;
  }, []);

  /**
   * 发送消息。
   *
   * @param opts.skipUserMsg  重发模式下用户消息已经在聊天里(401 时只删掉空 bot 气泡,
   *                          保留用户气泡作为可见上下文),续上时不再重复插入
   * @param opts.isRetry      标记本次调用是"登录后续上"的重发。
   *                          作用:即使重发再次 401(罕见,但可能 race),
   *                          不再 enqueue pending,避免登录 → 401 → 续 → 401 死循环
   */
  const handleSend = useCallback(async (
    text: string,
    opts?: { skipUserMsg?: boolean; isRetry?: boolean },
  ) => {
    initDoneRef.current = true;
    setRightPanelMode('debug');

    const userMsg: Message | null = opts?.skipUserMsg ? null : {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const botMsgId = crypto.randomUUID();
    botMsgIdRef.current = botMsgId;
    const botMsg: Message = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => userMsg ? [...prev, userMsg, botMsg] : [...prev, botMsg]);
    setLoading(true);

    const ctrl = sendMessageStream(text, {
      onTextDelta(delta) {
        updateBotMessage(content => content + delta);
      },

      onToolCalled(toolName) {
        setLamps(prev =>
          prev.map(l =>
            l.id === toolName
              ? { ...l, active: true, animKey: l.animKey + 1 }
              : l
          )
        );
        setTimeout(() => {
          setLamps(prev =>
            prev.map(l => (l.id === toolName ? { ...l, active: false } : l))
          );
        }, 1000);
      },

      onRawEvent(event) {
        if (event.eventType === 'text_delta') return;
        setRightPanelMode('debug');
        setDebugEvents(prev => [...prev, event]);
      },

      onDone: finishStream,

      onError() {
        updateBotMessage(content => content || t("status.error"));
        finishStream();
      },

      // 401:清理空 bot 气泡 + 关 loading + 暂存消息文本待登录后续上。
      // - 不展示"请求失败"误导用户(那是后端错误文案,这里是登录失效)
      // - 用户消息气泡保留在聊天里,作为登录弹窗背后的视觉上下文
      // - 重发模式(isRetry)不再 enqueue,防止 401→retry→401 死循环
      onAuthRequired() {
        const orphanId = botMsgIdRef.current;
        setMessages(prev => prev.filter(m => m.id !== orphanId));
        if (!opts?.isRetry) {
          pendingMessageRef.current = { text, ts: Date.now() };
        }
        finishStream();
      },
    }, conversationIdRef.current);

    abortCtrlRef.current = ctrl;
  }, [updateBotMessage, finishStream, t]);

  /**
   * 监听 isAuthed 从 false 翻到 true(登录/注册成功)→ 续上之前 401 失败的消息。
   * 用 prevIsAuthedRef 严格捕捉"翻转"瞬间,避免:
   *   - 初始挂载时 isAuthed 已经是 true 的回放
   *   - handleSend 改变引用导致 effect 重跑时的误触
   */
  useEffect(() => {
    const wasAuthed = prevIsAuthedRef.current;
    prevIsAuthedRef.current = isAuthed;

    if (wasAuthed || !isAuthed) return;
    const pending = pendingMessageRef.current;
    if (!pending) return;
    pendingMessageRef.current = null;

    // 陈年缓存兜底 — 超过 5 分钟视作过时,不回放,避免突兀
    if (Date.now() - pending.ts > PENDING_TTL_MS) return;

    handleSend(pending.text, { skipUserMsg: true, isRetry: true });
  }, [isAuthed, handleSend]);

  const handleClearHistory = useCallback(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    const oldConvId = conversationIdRef.current;
    deleteSnapshot(oldConvId).catch(() => {});

    localStorage.removeItem(CONVERSATION_ID_STORAGE_KEY);
    const newId = crypto.randomUUID();
    localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, newId);
    conversationIdRef.current = newId;
    setMessages([]);
    setDebugEvents([]);
    setRightPanelMode('code');
    setLoading(false);
    initDoneRef.current = false;
  }, []);

  const handleStop = useCallback(() => {
    // 1. Immediately abort frontend SSE read
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    // 2. Optimistic UI: show stopped immediately without waiting for backend
    updateBotMessage(content => content ? content + '\n\n' + t("status.stopped") : t("status.stopped"));
    setLoading(false);

    // 3. Backend abort async — notify user on failure
    stopAgent(conversationIdRef.current).then(ok => {
      if (!ok) {
        updateBotMessage(content => content + '\n\n' + t("status.backendError"));
      }
    });
  }, [updateBotMessage, t]);

  return (
    <div className={styles.shell}>
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <div className={styles.stage}>
        <div className={styles.chatPanel}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.logo}>⬡</span>
              <div>
                <p className={styles.title}>{t("app.title")}</p>
                <p className={styles.subtitle}>{t("app.subtitle")}</p>
              </div>
            </div>
            <ToolIndicators lamps={lamps} />
          </header>

          <div className={styles.chatWindowShell}>
            <ChatWindow messages={messages} loading={loading} />
            {historyLoading && messages.length === 0 && (
              <div className={styles.historyOverlay}>
                <div className={styles.historySpinner} />
              </div>
            )}
          </div>
          <ChatInput onSend={handleSend} onStop={handleStop} onClear={handleClearHistory} disabled={loading} />
        </div>

        <div className={styles.codePanel}>
          {rightPanelMode === 'code' ? (
            <CodeViewer />
          ) : (
            <DebugPanel events={debugEvents} onClear={() => setDebugEvents([])} />
          )}
        </div>
      </div>
    </div>
  );
}
