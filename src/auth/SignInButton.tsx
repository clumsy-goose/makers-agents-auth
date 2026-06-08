/**
 * SignInButton — 访客状态下的头部右侧 CTA
 * =====================================
 *
 * 渲染时机:user === null(访客模式)
 * 视觉与位置:复用 UserPill 的 fixed 顶右容器,但内容更紧凑
 * 行为:点击 → 调用 useAuthGate().openSignIn() 弹出登录弹窗
 *
 * design-taste-frontend-v1 baseline:
 *   - 与 UserPill / LangToggle 同档玻璃磨砂
 *   - 物理反馈 active: translateY(1px)
 *   - 永久脉冲点提示"未登录"
 */

import { useT } from '../i18n';
import styles from './SignInButton.module.css';

interface SignInButtonProps {
  onClick: () => void;
}

export default function SignInButton({ onClick }: SignInButtonProps) {
  const { t } = useT();

  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      aria-label={t('guest.signin')}
    >
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>{t('guest.signin')}</span>
      <ArrowIcon />
    </button>
  );
}

function ArrowIcon() {
  return (
    <svg
      className={styles.arrow}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
