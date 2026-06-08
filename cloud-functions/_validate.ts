/**
 * 用户名 / 密码格式校验 — login 与 register 复用。
 *
 * 规则(MVP,可按需放宽):
 *   - username: 3-10 字符,字母/数字/下划线/连字符
 *   - password: 8-16 字符
 *
 * 注:bcrypt 输入硬上限 72 字节,我们的 16 上限远低于此,无截断风险。
 */

const USERNAME_RE = /^[A-Za-z0-9_-]{3,10}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;

export interface ValidateResult {
  ok: boolean;
  reason?: string;
}

export function validateUsername(input: unknown): ValidateResult {
  if (typeof input !== 'string') return { ok: false, reason: 'username must be string' };
  if (!USERNAME_RE.test(input)) {
    return { ok: false, reason: 'username must be 3-10 chars of [A-Za-z0-9_-]' };
  }
  return { ok: true };
}

export function validatePassword(input: unknown): ValidateResult {
  if (typeof input !== 'string') return { ok: false, reason: 'password must be string' };
  if (input.length < PASSWORD_MIN) return { ok: false, reason: `password too short (min ${PASSWORD_MIN})` };
  if (input.length > PASSWORD_MAX) return { ok: false, reason: `password too long (max ${PASSWORD_MAX})` };
  return { ok: true };
}
