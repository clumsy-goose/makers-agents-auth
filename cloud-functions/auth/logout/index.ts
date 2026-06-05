/**
 * POST /auth/logout — 清除 Cookie
 *
 * 不要求验签:即便 token 已过期/伪造,我们也乐于覆盖一份 Max-Age=0 的空 Cookie。
 */

import { serializeCookie } from '../../_jwt';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

export async function onRequestPost(context: any): Promise<Response> {
  const env = (context.env ?? {}) as Record<string, string | undefined>;
  const cookie = serializeCookie('eo_token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    domain: env.COOKIE_DOMAIN || undefined,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...JSON_HEADERS, 'Set-Cookie': cookie },
  });
}
