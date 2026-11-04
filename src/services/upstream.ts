import type { Config } from "../config.js";
import {
  classifyUpstreamError,
  isTimeoutError,
  type UpstreamFailure,
} from "./errors.js";

export const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface UpstreamOpts {
  model: string;
  body: Record<string, unknown>;
  apiKey?: string;
  config: Config;
  fetchFn?: typeof fetch;
}

export type UpstreamResult =
  | { ok: true; response: Response }
  | { ok: false; failure: UpstreamFailure };

function buildHeaders(config: Config, apiKey?: string): Headers {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  h.set("HTTP-Referer", config.referer);
  h.set("X-Title", config.title);
  h.set("User-Agent", "openrouter-free-router/0.1");
  if (apiKey) h.set("Authorization", `Bearer ${apiKey}`);
  return h;
}

export async function callUpstream(opts: UpstreamOpts): Promise<UpstreamResult> {
  const { model, body, apiKey, config, fetchFn = fetch } = opts;
  const payload = { ...body, model };

  let res: Response;
  try {
    res = await fetchFn(CHAT_URL, {
      method: "POST",
      headers: buildHeaders(config, apiKey),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      failure: {
        kind: "retryable",
        reason: isTimeoutError(err) ? "timeout" : `network: ${String(err)}`,
      },
    };
  }

  if (res.ok) return { ok: true, response: res };

  const raw = await res.text().catch(() => "");
  return { ok: false, failure: classifyUpstreamError(res.status, raw) };
}
