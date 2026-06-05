/**
 * Agent handler — EdgeOne Makers
 * ========================================
 *
 * File path agents/chat/index.ts maps to **POST /chat**
 * (EdgeOne Makers routing convention: directory name = route, index = default entry)
 *
 * Files starting with _ (e.g. _tools.ts, _sse.ts) are private modules,
 * not mapped as public routes.
 *
 * context convention:
 *   context.request.body    — object, request body
 *   context.request.signal  — AbortSignal, set when /chat/stop is called
 *   conversation_id — conversation ID
 *   context.runId           — current run ID
 */

import OpenAI from 'openai';
import { run, Agent, OpenAIChatCompletionsModel, type Session } from '@openai/agents';
import { createLogger } from '../_logger';
import { createTools } from '../_tools';
import { sseResponse } from '../_sse';
import { requireAuth, AuthError, unauthorizedResponse } from '../_jwt';
import { readUserProfile, type UserProfile } from '../_db';

const logger = createLogger('chat');
const DEFAULT_MODEL = '@makers/hy3-preview';

export async function onRequest(context: any) {
  // ── 双层防御铁律:Agent 必须独立验签,不依赖中间件写下的任何 header ──
  // 即使有人绕过 EdgeOne 边缘节点直连内部 Agent 入口,这里也会 401 拒绝
  let authPayload;
  try {
    authPayload = requireAuth(context);
  } catch (e) {
    if (e instanceof AuthError) {
      logger.log(`[auth] reject: ${e.reason}`);
      return unauthorizedResponse(e.reason);
    }
    throw e;
  }
  logger.log(`[auth] ok: user=${authPayload.username} (${authPayload.sub})`);

  const message = (context.request.body ?? {}).message as string | undefined;
  if (!message) {
    return new Response(
      JSON.stringify({ error: "'message' is required" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const signal: AbortSignal | undefined = context.request.signal;

  // Use built-in store session adapter for persistence
  const session: Session | undefined =
    context.store && context.conversation_id ? context.store.openaiSession(context.conversation_id) : undefined;

  // Configure the OpenAI-compatible LLM model directly from runtime env.
  const env = (context.env ?? {}) as Record<string, string | undefined>;
  const llmClient = new OpenAI({
    apiKey: env.AI_GATEWAY_API_KEY,
    baseURL: env.AI_GATEWAY_BASE_URL,
  });
  const model = new OpenAIChatCompletionsModel(
    llmClient,
    env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL,
  );

  // Create OpenAI Agent
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant. Use the available tools to answer questions.',
    tools: createTools(),
    model: model,
  });

  // Map an SDK stream event to a business SSE event, or null to skip.
  const toSseEvent = (e: any) => {
    if (e.type === 'raw_model_stream_event' && e.data?.type === 'output_text_delta') {
      const delta = e.data.delta as string;
      logger.log(`[stream] text_delta: ${JSON.stringify(delta)}`);
      return { event: 'text_delta', data: { delta } };
    }
    if (e.type === 'run_item_stream_event' && e.name === 'tool_called') {
      const tool = e.item?.name ?? e.item?.rawItem?.name;
      if (tool) {
        logger.log(`[stream] tool_called: ${tool}`);
        return { event: 'tool_called', data: { tool } };
      }
    }
    return null;
  };

  // Convert SDK stream events into business SSE events.
  return sseResponse(
    async function* () {
      // ── trace 信号:Agent 已独立 HMAC 验签通过,在流首帧告诉前端 ──
      // 这是双层防御铁律的实证 — 前端 AuthChainTrace 看到此事件就点亮 Agent 节点。
      // 字段保留 sub / username / ts 方便客户端渲染时延 / 用户名校验。
      yield {
        event: 'auth_ok',
        data: {
          layer: 'agent',
          sub: authPayload.sub,
          username: authPayload.username,
          ts: Date.now(),
        },
      };

      // ── 阶段二链路第二步:Agent 内部读 Neon 取业务数据(HTTPS 模式) ──
      // 这一步是 pages-agent-auth-flow.html 方案一图示里 "Agent → Neon ← Agent" 这条边的实证。
      // 拿 JWT.sub 去 users 表查 profile,既给 LLM 注入个性化上下文,
      // 又让前端 AuthChainTrace 看到真实的 HTTPS 数据访问时延。
      let userProfile: UserProfile | null = null;
      const queryStart = Date.now();
      yield {
        event: 'neon_query_start',
        data: { layer: 'neon', op: 'select_user_profile', ts: queryStart },
      };
      try {
        userProfile = await readUserProfile(env, authPayload.sub);
        yield {
          event: 'neon_query_done',
          data: {
            layer: 'neon',
            ok: true,
            rows: userProfile ? 1 : 0,
            ms: Date.now() - queryStart,
            ts: Date.now(),
          },
        };
      } catch (e) {
        // Neon 不通时 Agent 仍然能继续(用降级 instructions),只是没有个性化上下文
        logger.error(`[neon] read failed: ${(e as Error).message}`);
        yield {
          event: 'neon_query_done',
          data: {
            layer: 'neon',
            ok: false,
            error: (e as Error).message,
            ms: Date.now() - queryStart,
            ts: Date.now(),
          },
        };
      }

      // 把 profile 注入到本次会话的 instructions(每条消息生效一次)
      const profileLine = userProfile
        ? `Currently signed-in user: ${userProfile.username} (registered ${userProfile.created_at}).`
        : `Signed-in user (id=${authPayload.sub}) — profile lookup unavailable.`;
      const sessionAgent = new Agent({
        name: agent.name,
        instructions: `${agent.instructions}\n\n${profileLine}`,
        tools: agent.tools,
        model: agent.model,
      });

      const result = await run(sessionAgent, message, { stream: true, signal, session });
      for await (const event of result.toStream()) {
        if (signal?.aborted) break;
        const sse = toSseEvent(event);
        if (sse) yield sse;
      }
    },
    { signal, logger },
  );
}
