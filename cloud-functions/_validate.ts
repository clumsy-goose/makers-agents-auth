/**
 * 用户名 / 密码格式校验 — login 与 register 复用。
 *
 * 规则刻意保守(MVP):
 *   - username: 3-32 字符,字母/数字/下划线/连字符
 *   - password: 8-72 字符(bcrypt 上限 72 字节)
 */

const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/;

export interface ValidateResult {
  ok: boolean;
  reason?: string;
}

export function validateUsername(input: unknown): ValidateResult {
  if (typeof input !== 'string') return { ok: false, reason: 'username must be string' };
  if (!USERNAME_RE.test(input)) {
    return { ok: false, reason: 'username must be 3-32 chars of [A-Za-z0-9_-]' };
  }
  return { ok: true };
}

export function validatePassword(input: unknown): ValidateResult {
  if (typeof input !== 'string') return { ok: false, reason: 'password must be string' };
  if (input.length < 8) return { ok: false, reason: 'password too short (min 8)' };
  if (input.length > 72) return { ok: false, reason: 'password too long (max 72)' };
  return { ok: true };
}
