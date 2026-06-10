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
 * AppShell — chooses the header pill based on auth state.
 *   authed → UserPill (badge + account menu)
 *   guest  → SignInButton (opens the login modal on click)
 *
 * AppInner is always mounted — anonymous visitors can browse the homepage.
 * Protected requests are the only thing that flips into a 401 / login modal.
 */
function AppShell() {
  const { user, signOut, openSignIn } = useAuthGate();
  return (
    <>
      {user
        ? <UserPill user={user} onSignOut={signOut} />
        : <SignInButton onClick={openSignIn} />}
      <AppInner isAuthed={user !== null} openSignIn={openSignIn} />
    </>
  );
}

interface AppInnerProps {
  isAuthed: boolean;
  openSignIn: () => void;
}

function AppInner({ isAuthed, openSignIn }: AppInnerProps) {
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
   * Pending-message buffer. Two ways the value gets set:
   *   1. **Guest gating** (top of handleSend): when an anonymous user clicks
   *      Send, we intercept on the client, never send the request, stash the
   *      text here, and open the modal. skipUserMsg=false (the user bubble
   *      hasn't been inserted yet — the retry call adds it).
   *   2. **401 fallback** (an authed token expires mid-flight): /chat fired
   *      and was rejected; the user bubble is already in the chat. Stash the
   *      text with skipUserMsg=true (don't insert the user bubble again on retry).
   *
   * Timestamp guard: if the user opens the modal, walks away, and comes back
   * hours later to sign in, we shouldn't suddenly replay an ancient question.
   * The retry effect drops anything older than 5 minutes.
   */
  const pendingMessageRef = useRef<{ text: string; ts: number; skipUserMsg: boolean } | null>(null);
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
    // Guests don't fetch history — /history is auth-gated, so probing it
    // would 401 and pop the modal on first paint, which is jarring for
    // someone who's just browsing. Wait until they actually sign in.
    if (!isAuthed) {
      setHistoryLoading(false);
      return;
    }

    // Skip history / snapshot loading when a 401-pending retry is queued.
    // Why: after 401 cleanup, messages = [userMsg]; the snapshot effect
    // (debounced 500ms) writes that "userMsg only" state. Sign-in usually
    // takes longer than 500ms, so by the time isAuthed flips back to true
    // the dirty snapshot has been persisted. Both effects fire on the same
    // flip — the retry pushes a botMsg synchronously and starts streaming,
    // while restoreSnapshot's promise resolves later and does
    // setMessages([userMsg]), wiping the in-flight bot bubble.
    // What we lose by skipping:
    //   - new sign-ups: no server history anyway, nothing lost
    //   - returning users: their history was already in messages state
    //     before the 401 (loaded earlier this session), nothing lost
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
   * Send a message.
   *
   * @param opts.skipUserMsg  When true, the user bubble is NOT re-inserted
   *                          (it's already in the chat — see the
   *                          pendingMessageRef docstring for the two paths).
   * @param opts.isRetry      Marks this call as a "post-sign-in resume".
   *                          Even if the resumed request also fails with 401
   *                          (rare, but possible under network hiccups), we
   *                          must NOT re-enqueue the pending message — that
   *                          would create a sign-in → 401 → retry → 401 loop.
   */
  const handleSend = useCallback(async (
    text: string,
    opts?: { skipUserMsg?: boolean; isRetry?: boolean },
  ) => {
    // Guest gating — anonymous users get the modal instead of a network call.
    // The text is stashed; the retry effect replays it after sign-in.
    // isRetry skips this gate: a retry call is triggered by us right after
    // sign-in completes; the `isAuthed=true` state may not yet have
    // propagated into this useCallback closure.
    if (!isAuthed && !opts?.isRetry) {
      pendingMessageRef.current = { text, ts: Date.now(), skipUserMsg: false };
      openSignIn();
      return;
    }

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

      // 401: clear the empty bot bubble, stop loading, stash text for resume.
      // - We do NOT show "request failed" — that's a backend-error message
      //   and would be misleading; this is a sign-in prompt.
      // - The user bubble stays as visible context behind the modal.
      // - Retry calls don't enqueue (avoids 401 → retry → 401 loops).
      // - skipUserMsg=true: this pending was set by a request whose user
      //   bubble already entered the chat; the resume must not re-insert it.
      onAuthRequired() {
        const orphanId = botMsgIdRef.current;
        setMessages(prev => prev.filter(m => m.id !== orphanId));
        if (!opts?.isRetry) {
          pendingMessageRef.current = { text, ts: Date.now(), skipUserMsg: true };
        }
        finishStream();
      },
    }, conversationIdRef.current);

    abortCtrlRef.current = ctrl;
  }, [isAuthed, openSignIn, updateBotMessage, finishStream, t]);

  /**
   * Watch isAuthed flipping from false → true (sign-in / sign-up succeeded)
   * and resume any pending message. We use prevIsAuthedRef to capture the
   * exact transition instant, which guards against:
   *   - initial mount where isAuthed is already true (no replay)
   *   - effect re-runs caused by handleSend re-creating its closure
   *
   * Pending source determines skipUserMsg (see the pendingMessageRef docstring):
   *   - guest gating → skipUserMsg=false; the resume inserts the user bubble
   *   - 401 fallback → skipUserMsg=true; user bubble already in chat
   */
  useEffect(() => {
    const wasAuthed = prevIsAuthedRef.current;
    prevIsAuthedRef.current = isAuthed;

    if (wasAuthed || !isAuthed) return;
    const pending = pendingMessageRef.current;
    if (!pending) return;
    pendingMessageRef.current = null;

    // Stale entry — older than the TTL, drop silently.
    if (Date.now() - pending.ts > PENDING_TTL_MS) return;

    handleSend(pending.text, { skipUserMsg: pending.skipUserMsg, isRetry: true });
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
