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

const logger = createLogger('chat');
const DEFAULT_MODEL = '@makers/hy3-preview';

export async function onRequest(context: any) {

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
    DEFAULT_MODEL,
  );

  // Create OpenAI Agent
  const agent = new Agent({
    name: 'Assistant',
    instructions: [
      'You are an EdgeOne Makers authentication expert assistant.',
      'Your role is to explain how the middleware-based JWT auth scheme works in this template.',
      '',
      'Tool-calling rules (you MUST follow):',
      '- For ANY question about middleware (matcher, config, how to write middleware.js, Web Crypto), call get_middleware_doc FIRST.',
      '- For ANY question about login/register/auth flow or two-layer defense, call get_auth_flow FIRST.',
      '- For ANY question about JWT structure, expiration, cookies, or signing algorithm, call get_jwt_spec FIRST.',
      '- NEVER answer middleware/auth/JWT questions from your own knowledge — always retrieve the doc first.',
      '- After retrieval, synthesize a concise answer in the user\'s language (Chinese or English).',
      '',
      'Style: clear, technical, with code snippets when useful. No marketing language.',
    ].join('\n'),
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
      yield {
        event: 'auth_ok',
        data: {
          layer: 'agent',
          sub: authPayload.sub,
          username: authPayload.username,
          ts: Date.now(),
        },
      };

      const sessionAgent = new Agent({
        name: agent.name,
        instructions: `${agent.instructions}\n\nCurrently signed-in user: ${authPayload.username} (id=${authPayload.sub}).`,
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
