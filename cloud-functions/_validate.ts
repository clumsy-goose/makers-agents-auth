/**
 * Username / password format checks — shared by login & register.
 *
 * Rules (MVP, easy to relax):
 *   - username: 3-10 chars, [A-Za-z0-9_-]
 *   - password: 8-16 chars
 *
 * Note: bcrypt has a hard input ceiling of 72 bytes — our 16 cap is well
 * below it, so there's no truncation risk.
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
