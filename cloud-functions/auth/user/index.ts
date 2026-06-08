/**
 * GET /auth/user — 返回当前已登录用户(前端刷新页面后用来回填会话状态)
 *
 * 鉴权拓扑:
 *   /auth/* 不在 middleware.js 的 matcher 里,平台路由直接派发到本函数,
 *   不经过边缘中间件 → 本函数是这条路径上**唯一的鉴权关卡**,必须自己 requireAuth。
 *
 *   验签实现(node:crypto HMAC-SHA256)与 middleware.js 的 Web Crypto 字节级一致,
 *   共用同一个 JWT_SECRET。
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
