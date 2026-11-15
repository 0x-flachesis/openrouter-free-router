import type { Config } from "../config.js";
import {
  classifyUpstreamError,
  classifyUpstreamSuccessBody,
  isTimeoutError,
  type UpstreamFailure,
} from "./errors.js";

export const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface UpstreamOpts {
  model: string;
  body: Record<string, unknown>;
  apiKey?: string;
  headers?: Headers;
  config: Config;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export type UpstreamResult =
  | { ok: true; response: Response; status: number }
  | { ok: false; failure: UpstreamFailure };

const DEFAULT_USER_AGENT = "openrouter-free-router/0.1";

/** Framing, hop-by-hop, and headers this proxy owns. `proxy-*` is blocked separately. */
const BLOCKED_REQUEST_HEADERS = new Set([
  "accept-encoding",
  "authorization",
  "connection",
  "content-encoding",
  "content-length",
  "content-type",
  "cookie",
  "expect",
  "host",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function isBlockedHeader(name: string, extra: Set<string>): boolean {
  const lower = name.toLowerCase();
  return BLOCKED_REQUEST_HEADERS.has(lower) || lower.startsWith("proxy-") || extra.has(lower);
}

function connectionHopHeaders(headers: Headers): Set<string> {
  const extra = new Set<string>();
  const raw = headers.get("connection");
  if (!raw) return extra;
  for (const part of raw.split(",")) {
    const name = part.trim().toLowerCase();
    if (name && name !== "close") extra.add(name);
  }
  return extra;
}

function clientHeader(headers: Headers | undefined, name: string): string | undefined {
  const value = headers?.get(name)?.trim();
  return value ? value : undefined;
}

function buildHeaders(config: Config, apiKey?: string, clientHeaders?: Headers): Headers {
  const h = new Headers();
  if (clientHeaders) {
    const extra = connectionHopHeaders(clientHeaders);
    for (const [name, value] of clientHeaders) {
      if (isBlockedHeader(name, extra)) continue;
      h.append(name, value);
    }
  }
  h.set("Content-Type", "application/json");
  h.set("HTTP-Referer", clientHeader(clientHeaders, "HTTP-Referer") ?? config.referer);
  h.set("X-Title", clientHeader(clientHeaders, "X-Title") ?? config.title);
  h.set("User-Agent", clientHeader(clientHeaders, "User-Agent") ?? DEFAULT_USER_AGENT);
  if (apiKey) h.set("Authorization", `Bearer ${apiKey}`);
  return h;
}

function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  if (!Number.isFinite(ms) || ms <= 0) return parent ?? AbortSignal.timeout(1);
  return parent ? AbortSignal.any([parent, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

export async function callUpstream(opts: UpstreamOpts): Promise<UpstreamResult> {
  const { model, body, apiKey, headers, config, fetchFn = fetch, signal } = opts;
  const { models: _clientModels, ...forwardBody } = body;
  const payload = { ...forwardBody, model };

  let res: Response;
  try {
    res = await fetchFn(CHAT_URL, {
      method: "POST",
      headers: buildHeaders(config, apiKey, headers),
      body: JSON.stringify(payload),
      signal: timeoutSignal(config.requestTimeoutMs, signal),
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

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    return { ok: false, failure: classifyUpstreamError(res.status, raw) };
  }

  if (!res.body) {
    return {
      ok: false,
      failure: { kind: "retryable", status: res.status, reason: "upstream empty body" },
    };
  }

  return { ok: true, response: res, status: res.status };
}

export async function readNonStreamingResponse(
  response: Response,
  signal?: AbortSignal,
): Promise<{ ok: true; text: string; status: number } | { ok: false; failure: UpstreamFailure }> {
  let text: string;
  try {
    if (signal) {
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
      } catch (err) {
        await reader.cancel().catch(() => undefined);
        throw err;
      }
      text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    } else {
      text = await response.text();
    }
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "AbortError" && signal?.aborted) {
      throw err;
    }
    return {
      ok: false,
      failure: { kind: "retryable", status: response.status, reason: `upstream body: ${String(err)}` },
    };
  }

  const embeddedFailure = classifyUpstreamSuccessBody(response.status, text);
  if (embeddedFailure) return { ok: false, failure: embeddedFailure };
  return { ok: true, text, status: response.status };
}
