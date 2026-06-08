/**
 * UserPill — 头部右侧用户徽章 + 账户菜单
 *
 * 折叠状态:[ A | alice ●]
 * 展开状态:折叠 + 下拉面板,显示
 *   - 用户名 / sub
 *   - JWT 算法 + Cookie 类型
 *   - exp 过期时间
 *   - 退出登录按钮
 *
 * 注:这里展示的 sub / exp 是从 /auth/user 二次拉取得到(JWT 是 HttpOnly Cookie,
 * JS 拿不到 token 本身,但 /auth/user 会回包含 user + exp)。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { API, type AuthUser } from '../api';
import styles from './UserPill.module.css';

interface UserPillProps {
  user: AuthUser;
  onSignOut: () => Promise<void>;
}

interface MeMeta {
  exp?: number;
  sub: string;
}

export default function UserPill({ user, onSignOut }: UserPillProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<MeMeta>({ sub: user.id });
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 展开时拉一次 /auth/user 同步 exp(JWT 在 HttpOnly Cookie 里,JS 解不到)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API.authUser, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { user: AuthUser; exp?: number };
        if (!cancelled) setMeta({ sub: data.user.id, exp: data.exp });
      } catch {
        /* noop — 默认显示已有的 user.id,exp 显示 — */
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // ESC / 点外部关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const initial = user.username.charAt(0).toUpperCase();

  const expText = (() => {
    if (!meta.exp) return '—';
    const d = new Date(meta.exp * 1000);
    return d.toLocaleString();
  })();

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await onSignOut();
  }, [onSignOut]);

  return (
    <div className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.pill}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={open ? t('pill.collapse') : t('pill.expand')}
      >
        <span className={styles.avatar} aria-hidden>{initial}</span>
        <span className={styles.username}>{user.username}</span>
        <span className={styles.statusDot} aria-hidden />
      </button>

      {open && (
        <>
          <div className={styles.menuBackdrop} onClick={() => setOpen(false)} aria-hidden />
          <div className={styles.menu} role="menu">
            <div className={styles.menuTop}>
              <span className={styles.menuAvatar} aria-hidden>{initial}</span>
              <div className={styles.menuUserMain}>
                <div className={styles.menuUserPrimary}>{user.username}</div>
                <div className={styles.menuUserSecondary}>{t('pill.you')}</div>
              </div>
            </div>

            <dl className={styles.menuMeta}>
              <div className={styles.metaRow}>
                <dt className={styles.metaLabel}>{t('pill.userId')}</dt>
                <dd className={styles.metaValue}><strong>{shortenUuid(meta.sub)}</strong></dd>
              </div>
              <div className={styles.metaRow}>
                <dt className={styles.metaLabel}>{t('pill.expiresAt')}</dt>
                <dd className={styles.metaValue}><strong>{expText}</strong></dd>
              </div>
            </dl>

            <button type="button" className={styles.signOut} onClick={handleSignOut}>
              <SignOutIcon />
              {t('pill.signout')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function shortenUuid(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3" />
      <path d="M21 12H10M17 8l4 4-4 4" />
    </svg>
  );
}
