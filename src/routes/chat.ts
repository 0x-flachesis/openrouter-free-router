import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { routeChatCall } from "../services/router.js";
import type { Config } from "../config.js";
import type { FreeModel } from "../types.js";

export interface ChatDeps {
  config: Config;
  getModels: () => FreeModel[];
  fetchFn?: typeof fetch;
  onAttempt?: (model: string, attempt: number) => void;
}

export function chatRoutes(deps: ChatDeps) {
  const app = new Hono();
  const { config, getModels, fetchFn, onAttempt } = deps;

  app.post("/v1/chat/completions", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.messages)) {
      return c.json({ error: { message: "messages is required", type: "invalid_request_error", code: "invalid_request" } }, 400);
    }

    const models = getModels();
    if (models.length === 0) {
      return c.json({ error: { message: "No free models available", type: "service_unavailable", code: "no_models" } }, 503);
    }

    const apiKey = (c as any).get("apiKey") as string | undefined;
    const upstreamSignal = c.req.raw.signal;
    const outcome = await routeChatCall({
      body,
      apiKey,
      models,
      config,
      fetchFn,
      signal: upstreamSignal,
      onAttempt,
    });

    if (outcome.kind === "context-length") {
      return c.json(
        { error: { message: outcome.failure.body.message, type: "invalid_request_error", code: "context_length_exceeded" } },
        400,
      );
    }
    if (outcome.kind === "client-error") {
      const upstreamCode = outcome.failure.body.code;
      const code = typeof upstreamCode === "number" || typeof upstreamCode === "string" ? upstreamCode : "upstream_error";
      return c.json(
        { error: { message: outcome.failure.body.message, type: "invalid_request_error", code } },
        outcome.failure.status as any,
      );
    }
    if (outcome.kind === "all-failed") {
      return c.json(
        { error: { message: `All free models failed after ${outcome.attempts} attempts: ${outcome.lastReason}`, type: "server_error", code: "all_models_failed" } },
        502,
      );
    }

    if (body.stream !== true) {
      return new Response(outcome.response.body, {
        status: outcome.status,
        headers: outcome.response.headers,
      });
    }

    const upstreamBody = outcome.response.body;
    if (!upstreamBody) {
      return c.json({ error: { message: "Upstream returned no body", type: "server_error" } }, 502);
    }
    return streamSSE(c, async (s) => {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      s.onAbort(() => void reader.cancel().catch(() => undefined));
      try {
        for (;;) {
          if (s.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) await s.write(chunk);
        }
        const tail = decoder.decode();
        if (tail) await s.write(tail);
      } catch (err) {
        if (!s.aborted) {
          await s.write(`data: ${JSON.stringify({ error: { message: `stream interrupted: ${String(err)}`, type: "server_error" } })}\n\n`);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        if (!s.aborted) await s.write("data: [DONE]\n\n");
      }
    });
  });

  return app;
}
