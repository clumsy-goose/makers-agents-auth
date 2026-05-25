import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, ToolLampState } from './types';
import { fetchConversationHistory, sendMessageStream, stopAgent } from './api';
import ToolIndicators from './components/ToolIndicators';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import CodeViewer from './components/CodeViewer';
import styles from './App.module.css';

const INITIAL_LAMPS: ToolLampState[] = [
  { id: 'get_weather',         label: 'Weather', icon: '☀️', active: false, animKey: 0 },
  { id: 'get_clothing_advice', label: 'Clothing', icon: '👔', active: false, animKey: 0 },
  { id: 'translate_text',      label: 'Translate', icon: '🌐', active: false, animKey: 0 },
  { id: 'text_statistics',     label: 'Statistics', icon: '📊', active: false, animKey: 0 },
];

const CONVERSATION_ID_STORAGE_KEY = 'eo_conversation_id';

function getOrCreateConversationId(): string {
  const cached = localStorage.getItem(CONVERSATION_ID_STORAGE_KEY);
  if (cached) return cached;

  const conversationId = crypto.randomUUID();
  localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, conversationId);
  return conversationId;
}

// Module-level dedup flag — outside React lifecycle, unaffected by StrictMode
let _historyFetchInFlight = false;

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [lamps, setLamps]       = useState<ToolLampState[]>(INITIAL_LAMPS);
  const [loading, setLoading]   = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const botMsgIdRef = useRef<string>('');
  const abortCtrlRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string>(getOrCreateConversationId());

  useEffect(() => {
    if (_historyFetchInFlight) return;
    _historyFetchInFlight = true;

    fetchConversationHistory(conversationIdRef.current).then(history => {
      if (history.length > 0) {
        setMessages(history);
      }
    }).finally(() => {
      _historyFetchInFlight = false;
      setHistoryLoading(false);
    });
  }, []);

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

  const handleSend = useCallback(async (text: string) => {
    const userMsg: Message = {
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

    setMessages(prev => [...prev, userMsg, botMsg]);
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

      onDone: finishStream,

      onError() {
        updateBotMessage(content => content || 'Request failed. Please check if the backend service is running.');
        finishStream();
      },
    }, conversationIdRef.current);

    abortCtrlRef.current = ctrl;
  }, [updateBotMessage, finishStream]);

  const handleClearHistory = useCallback(() => {
    localStorage.removeItem(CONVERSATION_ID_STORAGE_KEY);
    const newId = crypto.randomUUID();
    localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, newId);
    conversationIdRef.current = newId;
    setMessages([]);
  }, []);

  const handleStop = useCallback(() => {
    // 1. Immediately abort frontend SSE read
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    // 2. Optimistic UI: show stopped immediately without waiting for backend
    updateBotMessage(content => content ? content + '\n\n⏹ *Generation stopped*' : '⏹ *Generation stopped*');
    setLoading(false);

    // 3. Backend abort async — notify user on failure
    stopAgent(conversationIdRef.current).then(ok => {
      if (!ok) {
        updateBotMessage(content => content + '\n\n Backend abort request failed. The server may still be running.');
      }
    });
  }, [updateBotMessage]);

  return (
    <div className={styles.shell}>
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <div className={styles.stage}>
        <div className={styles.chatPanel}>
          {historyLoading && messages.length === 0 && (
            <div className={styles.historyOverlay}>
              <div className={styles.historySpinner} />
            </div>
          )}
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.logo}>⬡</span>
              <div>
                <p className={styles.title}>Agent Chat</p>
                <p className={styles.subtitle}>Running on EdgeOne Pages with session memory & Agent Tools</p>
              </div>
            </div>
            <ToolIndicators lamps={lamps} />
          </header>

          <ChatWindow messages={messages} loading={loading} />
          <ChatInput onSend={handleSend} onStop={handleStop} onClear={handleClearHistory} disabled={loading} />
        </div>

        <div className={styles.codePanel}>
          <CodeViewer />
        </div>
      </div>
    </div>
  );
}
