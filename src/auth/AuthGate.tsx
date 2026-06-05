/**
 * AuthGate — 登录 / 注册门面
 * ==========================
 *
 * 包裹 ChatApp 的鉴权壳层。职责:
 *   1. 启动时探测 /auth/me,确定当前会话状态
 *   2. 未登录时展示 split-screen 登录/注册表单
 *   3. 监听全局 'eo:auth-required' 事件(api.ts 在 401 时派发)→ 自动回退到登录态
 *   4. 登录/注册成功后,重置 user state 并把控制权交回 children(ChatApp)
 *
 * 视觉设计 — 严格遵循 design-taste-frontend-v1 (VARIANCE=8 / MOTION=6 / DENSITY=4):
 *   - Split Screen 50/50 不对称(禁用居中 hero)
 *   - 沿用项目 Syne / DM Mono / 金色 accent token
 *   - 完整 loading / error / inline helper 状态
 *   - active: translateY(1px) 物理反馈
 *
 * i18n 接入:全部文案走 useT(),与全局 LangToggle 联动。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  type AuthUser,
} from '../api';
import { useT, type MessageKeys } from '../i18n';
import { markJustAuthed } from './WelcomeFlash';
import styles from './AuthGate.module.css';

type Mode = 'login' | 'register';
type Phase = 'probing' | 'guest' | 'authenticated';

interface AuthGateProps {
  children: (user: AuthUser, signOut: () => Promise<void>) => React.ReactNode;
}

// 后端错误码 → i18n key 映射
const ERR_KEY: Record<string, MessageKeys> = {
  invalid_credentials: 'auth.err.invalid_credentials',
  username_taken: 'auth.err.username_taken',
  invalid_username: 'auth.err.invalid_username',
  invalid_password: 'auth.err.invalid_password',
  bad_request: 'auth.err.bad_request',
  db_error: 'auth.err.db_error',
  server_misconfigured: 'auth.err.server_misconfigured',
  auth_required: 'auth.err.auth_required',
};

export default function AuthGate({ children }: AuthGateProps) {
  const [phase, setPhase] = useState<Phase>('probing');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then(u => {
      if (cancelled) return;
      if (u) {
        setUser(u);
        setPhase('authenticated');
      } else {
        setPhase('guest');
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      setUser(null);
      setPhase('guest');
    };
    window.addEventListener('eo:auth-required', onAuthRequired);
    return () => window.removeEventListener('eo:auth-required', onAuthRequired);
  }, []);

  const handleAuthed = useCallback((u: AuthUser) => {
    setUser(u);
    setPhase('authenticated');
  }, []);

  const handleSignOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setPhase('guest');
  }, []);

  if (phase === 'probing') {
    return <div className={styles.shell} aria-busy="true" />;
  }

  if (phase === 'authenticated' && user) {
    return <>{children(user, handleSignOut)}</>;
  }

  return <AuthScreen onAuthed={handleAuthed} />;
}

// ── 登录/注册主屏 ──────────────────────────────────────────

function AuthScreen({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const { t } = useT();

  return (
    <div className={styles.shell}>
      <div className={`${styles.blob} ${styles.blobA}`} aria-hidden />
      <div className={`${styles.blob} ${styles.blobB}`} aria-hidden />

      {/* 左侧:文案 / 标识 */}
      <section className={styles.left}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden />
          <span>{t('auth.brand')}</span>
        </div>

        <div className={styles.heroBlock}>
          <span className={styles.eyebrow}>{t('auth.eyebrow')}</span>
          <h1 className={styles.headline}>
            {t('auth.headline.lead')}
            {' '}
            <em>{t('auth.headline.accent')}</em>
            {' '}
            {t('auth.headline.tail')}
          </h1>
          <p className={styles.deck}>{t('auth.deck')}</p>
        </div>

        <dl className={styles.signals}>
          <div className={styles.signal}>
            <dt className={styles.signalLabel}>{t('auth.signal.edge')}</dt>
            <dd className={styles.signalValue}>
              <span className={styles.pulse} aria-hidden />V8
            </dd>
          </div>
          <div className={styles.signal}>
            <dt className={styles.signalLabel}>{t('auth.signal.db')}</dt>
            <dd className={styles.signalValue}>Neon · HTTPS</dd>
          </div>
          <div className={styles.signal}>
            <dt className={styles.signalLabel}>{t('auth.signal.hash')}</dt>
            <dd className={styles.signalValue}>bcrypt 10</dd>
          </div>
          <div className={styles.signal}>
            <dt className={styles.signalLabel}>{t('auth.signal.token')}</dt>
            <dd className={styles.signalValue}>JWT · HS256</dd>
          </div>
        </dl>
      </section>

      {/* 右侧:表单 */}
      <section className={styles.right}>
        <div className={styles.card}>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
              onClick={() => setMode('login')}
            >
              {t('auth.tab.login')}
            </button>
            <button
              type="button"
              role="tab"
              className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
              onClick={() => setMode('register')}
            >
              {t('auth.tab.register')}
            </button>
          </div>

          {mode === 'login' ? (
            <CredentialsForm
              key="login"
              titleKey="auth.login.title"
              hintKey="auth.login.hint"
              submitKey="auth.login.submit"
              swapQKey="auth.login.swap.q"
              swapCtaKey="auth.login.swap.cta"
              autocompleteMode="login"
              action={apiLogin}
              onAuthed={onAuthed}
              onSwap={() => setMode('register')}
            />
          ) : (
            <CredentialsForm
              key="register"
              titleKey="auth.register.title"
              hintKey="auth.register.hint"
              submitKey="auth.register.submit"
              swapQKey="auth.register.swap.q"
              swapCtaKey="auth.register.swap.cta"
              autocompleteMode="register"
              action={apiRegister}
              onAuthed={onAuthed}
              onSwap={() => setMode('login')}
            />
          )}
        </div>
      </section>
    </div>
  );
}

// ── 通用表单 ────────────────────────────────────────────

interface FormProps {
  titleKey: MessageKeys;
  hintKey: MessageKeys;
  submitKey: MessageKeys;
  swapQKey: MessageKeys;
  swapCtaKey: MessageKeys;
  autocompleteMode: 'login' | 'register';
  action: (u: string, p: string) => Promise<AuthUser>;
  onAuthed: (u: AuthUser) => void;
  onSwap: () => void;
}

function CredentialsForm({
  titleKey, hintKey, submitKey, swapQKey, swapCtaKey,
  autocompleteMode, action, onAuthed, onSwap,
}: FormProps) {
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKeys | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // 切换表单时重置可见性,避免 register 切到 login 时密码意外暴露
  useEffect(() => {
    setShowPassword(false);
  }, [autocompleteMode]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    if (!username.trim() || !password) {
      setErrorKey('auth.error.empty');
      return;
    }
    setSubmitting(true);
    try {
      const u = await action(username.trim(), password);
      // 标记 just-authed,WelcomeFlash 首次挂载会消费这个 sessionStorage 项
      markJustAuthed(autocompleteMode);
      onAuthed(u);
    } catch (err) {
      const code = (err as Error).message;
      setErrorKey(ERR_KEY[code] ?? 'auth.err.unknown');
    } finally {
      setSubmitting(false);
    }
  }, [username, password, action, onAuthed, autocompleteMode]);

  const passwordAutocomplete = autocompleteMode === 'register' ? 'new-password' : 'current-password';

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <header className={styles.formHeader}>
        <h2 className={styles.formTitle}>{t(titleKey)}</h2>
        <p className={styles.formHint}>{t(hintKey)}</p>
      </header>

      {errorKey && (
        <div className={styles.alert} role="alert">
          <span>{t(errorKey)}</span>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="auth-username">
          {t('auth.field.username')}
        </label>
        <input
          ref={usernameRef}
          id="auth-username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          className={`${styles.input} ${errorKey && !username ? styles.inputError : ''}`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t('auth.field.username.placeholder')}
          disabled={submitting}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="auth-password">
          {t('auth.field.password')}
        </label>
        <div className={styles.passwordWrap}>
          <input
            id="auth-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={passwordAutocomplete}
            className={`${styles.input} ${styles.inputWithToggle} ${errorKey && !password ? styles.inputError : ''}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={submitting}
            required
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? t('auth.password.hide') : t('auth.password.show')}
            aria-pressed={showPassword}
            tabIndex={-1}
            disabled={submitting}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <span className={styles.helper}>{t('auth.field.password.helper')}</span>
      </div>

      <button
        type="submit"
        className={styles.submit}
        disabled={submitting}
      >
        {submitting && <span className={styles.spinner} aria-hidden />}
        {submitting ? t('auth.submit.busy') : t(submitKey)}
      </button>

      <p className={styles.swap}>
        {t(swapQKey)}
        <button type="button" className={styles.swapBtn} onClick={onSwap}>
          {t(swapCtaKey)}
        </button>
      </p>
    </form>
  );
}

// ── Icons (SVG · stroke-width 统一 1.5,与 skill 规范对齐) ────────

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12C4.5 7.5 8 5 12 5s7.5 2.5 9.5 7c-2 4.5-5.5 7-9.5 7s-7.5-2.5-9.5-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10.5 10.5 0 0 1 12 6c4 0 7.5 2.5 9.5 7-.6 1.4-1.5 2.6-2.5 3.6" />
      <path d="M6.5 7.5C4.7 8.9 3.4 10.7 2.5 12c2 4.5 5.5 7 9.5 7 1.7 0 3.3-.4 4.7-1.2" />
      <path d="M9.9 9.9a3 3 0 1 0 4.2 4.2" />
    </svg>
  );
}
