import type { Config } from "../config.js";
import type { FreeModel } from "../types.js";
import { callUpstream, type UpstreamOpts } from "./upstream.js";
import type { UpstreamFailure } from "./errors.js";

type ContextLengthFailure = Extract<UpstreamFailure, { kind: "context-length" }>;
type ClientErrorFailure = Extract<UpstreamFailure, { kind: "client-error" }>;

export type RouterOutcome =
  | { kind: "ok"; response: Response; model: string }
  | { kind: "context-length"; model: string; failure: ContextLengthFailure }
  | { kind: "client-error"; model: string; failure: ClientErrorFailure }
  | { kind: "all-failed"; attempts: number; lastReason: string };

export interface RoutedCall {
  body: Record<string, unknown>;
  apiKey?: string;
  models: FreeModel[];
  config: Config;
  fetchFn?: typeof fetch;
  onAttempt?: (model: string, attempt: number) => void;
}

export async function routeChatCall(opts: RoutedCall): Promise<RouterOutcome> {
  const { body, apiKey, models, config, fetchFn, onAttempt } = opts;
  const limit = Math.max(1, Math.min(models.length, config.maxAttempts));
  let lastReason = "no models available";
  let attempts = 0;

  for (let i = 0; i < limit; i++) {
    const model = models[i]!;
    attempts = i + 1;
    onAttempt?.(model.id, attempts);
    const result: Awaited<ReturnType<typeof callUpstream>> = await callUpstream({
      model: model.id,
      body,
      apiKey,
      config,
      fetchFn,
    } as UpstreamOpts);
    if (result.ok) {
      return { kind: "ok", response: result.response, model: model.id };
    }
    const f = result.failure;
    if (f.kind === "context-length") {
      return { kind: "context-length", model: model.id, failure: f };
    }
    if (f.kind === "client-error") {
      return { kind: "client-error", model: model.id, failure: f };
    }
    lastReason = f.reason;
  }
  return { kind: "all-failed", attempts, lastReason };
}
