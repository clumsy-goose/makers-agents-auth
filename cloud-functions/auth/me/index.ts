/**
 * GET /auth/me — 返回当前已登录用户(仅前端用于刷新页面后回填会话状态)
 *
 * 注意:中间件已经在 /auth/me 命中前用 matcher 把它纳入 mw 流程,
 * 但 /auth/* 在中间件白名单里 → 不验签直接放行,所以本函数必须自己 requireAuth。
 */

import { requireAuth, AuthError, unauthorizedResponse } from '../../_jwt';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

export async function onRequestGet(context: any): Promise<Response> {
  let payload;
  try {
    payload = requireAuth(context);
  } catch (e) {
    if (e instanceof AuthError) return unauthorizedResponse(e.reason);
    throw e;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      user: { id: payload.sub, username: payload.username },
      exp: payload.exp,
    }),
    { status: 200, headers: JSON_HEADERS },
  );
}

// 兼容部分前端用 POST 刷新会话的场景
export const onRequestPost = onRequestGet;
