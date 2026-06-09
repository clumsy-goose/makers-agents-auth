/**
 * POST /auth/logout — clear cookie
 *
 * No JWT required: even with an expired or forged token we are happy to
 * overwrite the cookie with Max-Age=0 (otherwise an expired token would
 * lock the user out of logging out, which is silly).
 */

import { serializeCookie } from '../../_jwt';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

export async function onRequestPost(_context: any): Promise<Response> {
  const cookie = serializeCookie('jwt_token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, 'Set-Cookie': cookie },
  });
}
