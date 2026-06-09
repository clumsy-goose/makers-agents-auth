/**
 * SignInButton — header CTA shown to anonymous visitors.
 *
 * Rendered when user === null (guest mode). Sits in the same fixed top-right
 * slot as UserPill but more compact. Click → useAuthGate().openSignIn().
 *
 * Visual: glassmorphism pill matching UserPill / LangToggle, with a perpetual
 * gold pulse dot to signal "you're not signed in".
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
