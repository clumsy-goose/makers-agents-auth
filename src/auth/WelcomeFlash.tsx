/**
 * WelcomeFlash — 登录/注册成功后的"鉴权链路激活"动画卡片
 *
 * 触发机制:
 *   - AuthGate 在 handleAuthed() 时往 sessionStorage 写 'eo:just-authed'
 *     (值为 'login' 或 'register')
 *   - 本组件首次挂载时读取并消费该标记;只在"刚刚验证通过"时显示一次
 *   - 用户主动刷新页面时不会再触发(标记已被消费 + 浏览器 reload 清空 sessionStorage 行为)
 *
 * 视觉:Bento 风格半透明卡 + 4 节点 staggered 链路动画
 *   节点 1 浏览器        Cookie jwt_token
 *   节点 2 Middleware    Web Crypto 早拒
 *   节点 3 Cloud Function bcrypt + 签 JWT
 *   节点 4 Agent Runtime node:crypto 自验签
 */

import { useEffect, useState } from 'react';
import { useT, type MessageKeys } from '../i18n';
import styles from './WelcomeFlash.module.css';

const STORAGE_KEY = 'eo:just-authed';
const AUTO_DISMISS_MS = 5500;

type Mode = 'login' | 'register';

export function markJustAuthed(mode: Mode): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* SSR / private mode — silent skip */
  }
}

function consumeJustAuthed(): Mode | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === 'login' || v === 'register') {
      sessionStorage.removeItem(STORAGE_KEY);
      return v;
    }
  } catch {
    /* noop */
  }
  return null;
}

export default function WelcomeFlash() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode | null>(null);
  const [exiting, setExiting] = useState(false);

  // 首次挂载读取 sessionStorage 标记
  useEffect(() => {
    const m = consumeJustAuthed();
    if (m) setMode(m);
  }, []);

  // 自动 dismiss
  useEffect(() => {
    if (!mode) return;
    const t1 = window.setTimeout(() => setExiting(true), AUTO_DISMISS_MS);
    const t2 = window.setTimeout(() => setMode(null), AUTO_DISMISS_MS + 360);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mode]);

  if (!mode) return null;

  const titleKey: MessageKeys = mode === 'register' ? 'welcome.title.register' : 'welcome.title.login';

  return (
    <div className={`${styles.flash} ${exiting ? styles.exiting : ''}`} role="status" aria-live="polite">
      <div className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <span className={styles.checkBig} aria-hidden>
              <CheckIcon />
            </span>
            <span className={styles.title}>{t(titleKey)}</span>
          </div>
          <div className={styles.subtitle}>{t('welcome.subtitle')}</div>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={() => setExiting(true)}
          aria-label={t('welcome.dismiss')}
        >
          <XIcon />
        </button>
      </div>

      <div className={styles.chain}>
        <Node label={t('welcome.chain.browser')}    note={t('welcome.chain.browser.note')} />
        <Node label={t('welcome.chain.middleware')} note={t('welcome.chain.middleware.note')} />
        <Node label={t('welcome.chain.cf')}          note={t('welcome.chain.cf.note')} />
        <Node label={t('welcome.chain.agent')}       note={t('welcome.chain.agent.note')} />
      </div>
    </div>
  );
}

function Node({ label, note }: { label: string; note: string }) {
  return (
    <div className={styles.node}>
      <span className={styles.dot} aria-hidden>
        <CheckIcon />
      </span>
      <span className={styles.nodeLabel}>{label}</span>
      <span className={styles.nodeNote}>{note}</span>
    </div>
  );
}

// ── Inline SVG icons (stroke-width 2,与小尺寸图标更匹配) ──

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5L9.5 18 20 7" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
