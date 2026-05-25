import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import ChatBubble from './ChatBubble';
import styles from './ChatWindow.module.css';

interface Props {
  messages: Message[];
  loading: boolean;
}

export default function ChatWindow({ messages, loading }: Props) {
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    const el = windowRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const lastMsg = messages[messages.length - 1];
  const showTypingIndicator = loading && !(lastMsg?.role === 'assistant' && lastMsg.content.length > 0);

  return (
    <div ref={windowRef} className={styles.window}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⬡</span>
          <p className={styles.emptyTitle}>OpenAI Agents Starter</p>
          <p className={styles.emptyHint}>
            I'm an OpenAI Agent running on EdgeOne with custom tools and session memory. I can help with weather, clothing advice, translation, and text statistics.
          </p>
          <p className={styles.emptyFeatures}>
            EdgeOne Store · Session Memory · Agent Tools
          </p>
        </div>
      )}

      {messages.map(msg => (
        <ChatBubble key={msg.id} message={msg} />
      ))}

      {showTypingIndicator && (
        <div className={styles.typingRow}>
          <div className={styles.avatar}>⬡</div>
          <div className={styles.typing}>
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
