import type React from 'react';
import styles from './CodeViewer.module.css';

/* ── Token factory ── */
const token = (cls: string) =>
  function Token({ t }: { t: string }) { return <span className={cls}>{t}</span>; };

const Cmt = token(styles.cmt);
const Kw  = token(styles.kw);
const Fn  = token(styles.fn);
const Ty  = token(styles.ty);
const Str = token(styles.str);
const Op  = token(styles.op);
const Va  = token(styles.va);

interface LineProps { n: number; children?: React.ReactNode }
const L = ({ n, children }: LineProps) => (
  <div className={styles.line}>
    <span className={styles.ln}>{String(n).padStart(2, ' ')}</span>
    <span className={styles.lc}>{children ?? ' '}</span>
  </div>
);

/* Indentation shorthand */
const I = () => <span className={styles.indent} />;
const I2 = () => <><span className={styles.indent} /><span className={styles.indent} /></>;

export default function CodeViewer() {
  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.fileIcon}>⬡</span>
          <span className={styles.filename}>middleware.js<span className={styles.sep}></span></span>
        </div>
        <span className={styles.badge}>READ ONLY</span>
      </div>

      {/* ── Code body ── */}
      <div className={styles.body}>
        {/* CRT scanline overlay */}
        <div className={styles.scanline} aria-hidden />

        <div className={styles.code}>
          {/* ── Header comment ── */}
          <L n={1}>
            <Cmt t="// EdgeOne Pages Middleware — JWT early-reject at the edge" />
          </L>
          <L n={2} />

          {/* ── Constants ── */}
          <L n={3}>
            <Kw t="const " /><Va t="COOKIE_NAME" /><Op t=" = " /><Str t="'jwt_token'" /><Op t=";" />
          </L>
          <L n={4}>
            <Kw t="const " /><Va t="ALG" /><Op t=" = " /><Str t="'HS256'" /><Op t=";" />
          </L>
          <L n={5} />

          {/* ── Matcher: protected paths ── */}
          <L n={6}>
            <Cmt t="// matcher = single source of truth for protected paths" />
          </L>
          <L n={7}>
            <Kw t="export " /><Kw t="const " /><Va t="config" /><Op t=" = {" />
          </L>
          <L n={8}>
            <I /><Va t="matcher" /><Op t=": [" />
          </L>
          <L n={9}>
            <I2 /><Str t="'/chat/:path*'" /><Op t="," />
          </L>
          <L n={10}>
            <I2 /><Str t="'/stop/:path*'" /><Op t="," />
          </L>
          <L n={11}>
            <I2 /><Str t="'/history/:path*'" /><Op t="," />
          </L>
          <L n={12}>
            <I /><Op t="]," />
          </L>
          <L n={13}>
            <Op t="};" />
          </L>
          <L n={14} />

          {/* ── Main entry ── */}
          <L n={15}>
            <Cmt t="// Only protected paths reach this function" />
          </L>
          <L n={16}>
            <Kw t="export " /><Kw t="async " /><Kw t="function " /><Fn t="middleware" />
            <Op t="(" /><Va t="context" /><Op t=") {" />
          </L>
          <L n={17}>
            <I /><Kw t="const " /><Op t="{ " /><Va t="request" /><Op t=", " />
            <Va t="next" /><Op t=", " /><Va t="env" /><Op t=" } = " /><Va t="context" /><Op t=";" />
          </L>
          <L n={18} />
          <L n={19}>
            <I /><Cmt t="// 1. Read JWT from HttpOnly cookie" />
          </L>
          <L n={20}>
            <I /><Kw t="const " /><Va t="token" /><Op t=" = " />
            <Fn t="readCookie" /><Op t="(" /><Va t="request" /><Op t="." />
            <Va t="headers" /><Op t=", " /><Va t="COOKIE_NAME" /><Op t=");" />
          </L>
          <L n={21}>
            <I /><Kw t="if " /><Op t="(!" /><Va t="token" /><Op t=") " />
            <Kw t="return " /><Fn t="unauthorized" /><Op t="(" /><Str t="'no auth cookie'" /><Op t=");" />
          </L>
          <L n={22} />
          <L n={23}>
            <I /><Cmt t="// 2. Verify with Web Crypto (HS256)" />
          </L>
          <L n={24}>
            <I /><Kw t="try " /><Op t="{" />
          </L>
          <L n={25}>
            <I2 /><Kw t="await " /><Fn t="verifyJwt" /><Op t="(" />
            <Va t="token" /><Op t=", " /><Va t="env" /><Op t="." /><Va t="JWT_SECRET" /><Op t=");" />
          </L>
          <L n={26}>
            <I /><Op t="} " /><Kw t="catch " /><Op t="(" /><Va t="e" /><Op t=") {" />
          </L>
          <L n={27}>
            <I2 /><Kw t="return " /><Fn t="unauthorized" /><Op t="(" />
            <Va t="e" /><Op t="." /><Va t="message" /><Op t=" || " /><Str t="'verify failed'" /><Op t=");" />
          </L>
          <L n={28}>
            <I /><Op t="}" />
          </L>
          <L n={29} />
          <L n={30}>
            <I /><Cmt t="// 3. Pass through — Agent / cf must verify independently" />
          </L>
          <L n={31}>
            <I /><Kw t="return " /><Fn t="next" /><Op t="();" />
          </L>
          <L n={32}><Op t="}" /></L>
          <L n={33} />

          {/* ── verifyJwt ── */}
          <L n={34}>
            <Cmt t="// ── HS256 JWT verification (Web Crypto) ──" />
          </L>
          <L n={35}>
            <Kw t="async " /><Kw t="function " /><Fn t="verifyJwt" />
            <Op t="(" /><Va t="token" /><Op t=", " /><Va t="secret" /><Op t=") {" />
          </L>
          <L n={36}>
            <I /><Kw t="const " /><Op t="[" /><Va t="headerB64" /><Op t=", " />
            <Va t="payloadB64" /><Op t=", " /><Va t="sigB64" /><Op t="] = " />
            <Va t="token" /><Op t="." /><Fn t="split" /><Op t="(" /><Str t="'.'" /><Op t=");" />
          </L>
          <L n={37} />
          <L n={38}>
            <I /><Cmt t="// Defend against alg=none" />
          </L>
          <L n={39}>
            <I /><Kw t="const " /><Va t="header" /><Op t=" = " />
            <Ty t="JSON" /><Op t="." /><Fn t="parse" /><Op t="(" />
            <Fn t="bytesToUtf8" /><Op t="(" /><Fn t="b64urlToBytes" /><Op t="(" />
            <Va t="headerB64" /><Op t=")));" />
          </L>
          <L n={40}>
            <I /><Kw t="if " /><Op t="(" /><Va t="header" /><Op t="." /><Va t="alg" />
            <Op t=" !== " /><Va t="ALG" /><Op t=") " />
            <Kw t="throw " /><Kw t="new " /><Ty t="Error" /><Op t="(" />
            <Str t="'unsupported alg'" /><Op t=");" />
          </L>
          <L n={41} />
          <L n={42}>
            <I /><Cmt t="// HMAC-SHA256 signature check" />
          </L>
          <L n={43}>
            <I /><Kw t="const " /><Va t="key" /><Op t=" = " /><Kw t="await " />
            <Va t="crypto" /><Op t="." /><Va t="subtle" /><Op t="." /><Fn t="importKey" /><Op t="(" />
          </L>
          <L n={44}>
            <I2 /><Str t="'raw'" /><Op t=", " /><Fn t="utf8ToBytes" /><Op t="(" />
            <Va t="secret" /><Op t=")," />
          </L>
          <L n={45}>
            <I2 /><Op t="{ " /><Va t="name" /><Op t=": " /><Str t="'HMAC'" />
            <Op t=", " /><Va t="hash" /><Op t=": " /><Str t="'SHA-256'" /><Op t=" }," />
          </L>
          <L n={46}>
            <I2 /><Va t="false" /><Op t=", [" /><Str t="'sign'" /><Op t=", " />
            <Str t="'verify'" /><Op t="]," />
          </L>
          <L n={47}>
            <I /><Op t=");" />
          </L>
          <L n={48}>
            <I /><Kw t="const " /><Va t="expected" /><Op t=" = " /><Kw t="new " />
            <Ty t="Uint8Array" /><Op t="(" />
          </L>
          <L n={49}>
            <I2 /><Kw t="await " /><Va t="crypto" /><Op t="." /><Va t="subtle" />
            <Op t="." /><Fn t="sign" /><Op t="(" /><Str t="'HMAC'" /><Op t=", " />
            <Va t="key" /><Op t=", ...)," />
          </L>
          <L n={50}>
            <I /><Op t=");" />
          </L>
          <L n={51}>
            <I /><Kw t="if " /><Op t="(!" /><Fn t="timingSafeEqual" />
            <Op t="(" /><Va t="expected" /><Op t=", " /><Va t="actual" /><Op t=")) " />
          </L>
          <L n={52}>
            <I2 /><Kw t="throw " /><Kw t="new " /><Ty t="Error" />
            <Op t="(" /><Str t="'signature mismatch'" /><Op t=");" />
          </L>
          <L n={53} />
          <L n={54}>
            <I /><Cmt t="// Expiry check" />
          </L>
          <L n={55}>
            <I /><Kw t="const " /><Va t="payload" /><Op t=" = " /><Ty t="JSON" />
            <Op t="." /><Fn t="parse" /><Op t="(...);" />
          </L>
          <L n={56}>
            <I /><Kw t="if " /><Op t="(" /><Va t="payload" /><Op t="." /><Va t="exp" />
            <Op t=" < " /><Ty t="Date" /><Op t="." /><Fn t="now" /><Op t="() / " />
            <Va t="1000" /><Op t=") " />
            <Kw t="throw " /><Kw t="new " /><Ty t="Error" /><Op t="(" />
            <Str t="'expired'" /><Op t=");" />
          </L>
          <L n={57} />
          <L n={58}>
            <I /><Kw t="return " /><Va t="payload" /><Op t=";" />
          </L>
          <L n={59}><Op t="}" /></L>
        </div>
      </div>

      {/* ── Footer tag ── */}
      <div className={styles.footer}>
        <span className={styles.footerDot} />
        <span>EdgeOne Pages Middleware · Edge V8 Runtime</span>
      </div>
    </div>
  );
}
