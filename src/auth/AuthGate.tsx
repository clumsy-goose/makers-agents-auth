/**
 * AuthGate — 鉴权上下文 + 按需登录弹窗
 * ====================================
 *
 * 设计意图(2026-06 重构):
 *   旧版本是"硬门面" — 未登录时整页拦截,只展示登录页。
 *   新版本是"软门面" — 始终渲染主界面(homepage),只有当业务接口触发 401
 *   或用户主动点击 "Sign in" 时才弹出登录弹窗。
 *
 * 工作流程:
 *   1. 启动探测 /auth/me,确定当前会话状态(authenticated 或 guest)
 *   2. 通过 React Context 把 { user, signOut, openSignIn } 暴露给整棵子树
 *   3. 监听全局 'eo:auth-required' 事件(api.ts 在任何 401 时派发)→ 弹出登录弹窗
 *   4. 登录/注册成功 → 关弹窗 + 同步 user state(子组件经 hook 拿到最新 user)
 *
 * 弹窗形态:
 *   - 仅展示表单卡(原 split-screen 左侧 hero 文案已删除)
 *   - 居中、磨砂玻璃 backdrop、ESC / 点击 backdrop 关闭、右上角 X 按钮
 *   - 复用 CredentialsForm 组件(login / register 切换)
 *
 * i18n 接入:全部文案走 useT(),与全局 LangToggle 联动。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  type AuthUser,
} from '../api';
import { useT, type MessageKeys } from '../i18n';
import styles from './AuthGate.module.css';

type Mode = 'login' | 'register';
type Phase = 'probing' | 'ready';

// ── Context ───────────────────────────────────────────────

interface AuthGateContextValue {
  /** null 表示当前是访客(guest);非 null 即已登录 */
  user: AuthUser | null;
  /** 触发登出 — 清 cookie 后 user 置 null,UI 自动切回访客态 */
  signOut: () => Promise<void>;
  /** 打开登录弹窗(用户主动点击 / 接到 401 自动触发) */
  openSignIn: () => void;
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null);

/** 子组件用此 hook 获取鉴权状态 / 打开登录弹窗 */
export function useAuthGate(): AuthGateContextValue {
  const ctx = useContext(AuthGateContext);
  if (!ctx) throw new Error('useAuthGate must be used within <AuthGate>');
  return ctx;
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

// ── Provider 主组件 ────────────────────────────────────────

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [phase, setPhase] = useState<Phase>('probing');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 启动探测 — 决定初始的 user 状态
  useEffect(() => {
    let cancelled = false;
    fetchMe().then(u => {
      if (cancelled) return;
      setUser(u);
      setPhase('ready');
    });
    return () => { cancelled = true; };
  }, []);

  // 全局 401 监听 — 业务请求接到 401 自动弹登录窗
  useEffect(() => {
    const onAuthRequired = () => {
      setUser(null);
      setModalOpen(true);
    };
    window.addEventListener('eo:auth-required', onAuthRequired);
    return () => window.removeEventListener('eo:auth-required', onAuthRequired);
  }, []);

  const handleAuthed = useCallback((u: AuthUser) => {
    setUser(u);
    setModalOpen(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const openSignIn = useCallback(() => {
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  // 探测阶段:渲染极简骨架避免内容闪烁
  if (phase === 'probing') {
    return <div className={styles.probeShell} aria-busy="true" />;
  }

  return (
    <AuthGateContext.Provider value={{ user, signOut: handleSignOut, openSignIn }}>
      {children}
      {modalOpen && !user && (
        <AuthModal onAuthed={handleAuthed} onClose={closeModal} />
      )}
    </AuthGateContext.Provider>
  );
}

// ── 登录弹窗 ────────────────────────────────────────────────

interface AuthModalProps {
  onAuthed: (u: AuthUser) => void;
  onClose: () => void;
}

function AuthModal({ onAuthed, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const { t } = useT();

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 锁定 body 滚动 — 弹窗期间防止背景跟随
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label={t('auth.modal.dismiss')}
        >
          <XIcon />
        </button>

        <span id="auth-modal-title" className={styles.modalEyebrow}>
          {t('auth.modal.required')}
        </span>

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
      onAuthed(u);
    } catch (err) {
      const code = (err as Error).message;
      setErrorKey(ERR_KEY[code] ?? 'auth.err.unknown');
    } finally {
      setSubmitting(false);
    }
  }, [username, password, action, onAuthed]);

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

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
