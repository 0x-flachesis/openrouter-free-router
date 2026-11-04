import { Hono } from "hono";
import { stream } from "hono/streaming";
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
    const outcome = await routeChatCall({ body, apiKey, models, config, fetchFn, onAttempt });

    if (outcome.kind === "context-length") {
      return c.json(
        { error: { message: outcome.failure.body.message, type: "invalid_request_error", code: "context_length_exceeded" } },
        400,
      );
    }
    if (outcome.kind === "client-error") {
      return c.json(
        { error: { message: outcome.failure.body.message, type: "invalid_request_error", code: outcome.failure.body.code ?? "upstream_error" } },
        outcome.failure.status,
      );
    }
    if (outcome.kind === "all-failed") {
      return c.json(
        { error: { message: `All free models failed after ${outcome.attempts} attempts: ${outcome.lastReason}`, type: "server_error", code: "all_models_failed" } },
        502,
      );
    }

    // Non-streaming: forward body as-is
    if (body.stream !== true) {
      const text = await outcome.response.text();
      c.header("Content-Type", outcome.response.headers.get("Content-Type") ?? "application/json");
      return c.body(text, outcome.response.status as any);
    }

    // Streaming: bridge upstream SSE reader into Hono stream
    const upstreamBody = outcome.response.body;
    if (!upstreamBody) {
      return c.json({ error: { message: "Upstream returned no body", type: "server_error" } }, 502);
    }
    return stream(c, async (s) => {
      const reader = upstreamBody.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          await s.write(chunk);
        }
      } catch (err) {
        const msg = `data: ${JSON.stringify({ error: { message: `stream interrupted: ${String(err)}`, type: "server_error" } })}\n\n`;
        await s.write(msg);
      } finally {
        await s.write("data: [DONE]\n\n");
      }
    });
  });

  return app;
}
