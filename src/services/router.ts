import type { Config } from "../config.js";
import type { FreeModel } from "../types.js";
import {
  callUpstream,
  readNonStreamingResponse,
} from "./upstream.js";
import type { UpstreamFailure } from "./errors.js";

type ContextLengthFailure = Extract<UpstreamFailure, { kind: "context-length" }>;
type ClientErrorFailure = Extract<UpstreamFailure, { kind: "client-error" }>;

export type RouterOutcome =
  | { kind: "ok"; response: Response; status: number; model: string }
  | { kind: "context-length"; model: string; failure: ContextLengthFailure }
  | { kind: "client-error"; model: string; failure: ClientErrorFailure }
  | { kind: "all-failed"; attempts: number; lastReason: string };

export interface RoutedCall {
  body: Record<string, unknown>;
  apiKey?: string;
  headers?: Headers;
  models: FreeModel[];
  config: Config;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  onAttempt?: (model: string, attempt: number) => void;
}

export function userFallbackModels(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.models)) return [];
  const seen = new Set<string>();
  const idents: string[] = [];
  for (const item of body.models) {
    if (typeof item !== "string") continue;
    // Strip OpenRouter routing prefix for dedupe/group purposes but keep the full ID for upstream.
    const key = item.replace(/^~(?=[^/]+\/)/, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    idents.push(item);
  }
  return idents;
}

export async function routeChatCall(opts: RoutedCall): Promise<RouterOutcome> {
  const { body, apiKey, headers, models, config, fetchFn, signal, onAttempt } = opts;
  const freeCandidates = [...models];
  const fallbackCandidates = userFallbackModels(body).filter(
    (id) => !freeCandidates.some((m) => m.id === id),
  );
  const candidates = [
    ...freeCandidates.map((m) => ({ id: m.id, tier: "free" as const })),
    ...fallbackCandidates.map((id) => ({ id, tier: "user" as const })),
  ];

  let lastReason = "no models available";
  let attempts = 0;

  for (const candidate of candidates) {
    attempts += 1;
    onAttempt?.(candidate.id, attempts);
    const result = await callUpstream({
      model: candidate.id,
      body,
      apiKey,
      headers,
      config,
      fetchFn,
      signal,
    });
    if (!result.ok) {
      const f = result.failure;
      if (f.kind === "context-length") {
        return { kind: "context-length", model: candidate.id, failure: f };
      }
      if (f.kind === "client-error") {
        return { kind: "client-error", model: candidate.id, failure: f };
      }
      lastReason = f.reason;
      continue;
    }

    if (body.stream === true) {
      return { kind: "ok", response: result.response, status: result.status, model: candidate.id };
    }

    const read = await readNonStreamingResponse(result.response, signal);
    if (!read.ok) {
      const f = read.failure;
      if (f.kind === "context-length") {
        return { kind: "context-length", model: candidate.id, failure: f };
      }
      if (f.kind === "client-error") {
        return { kind: "client-error", model: candidate.id, failure: f };
      }
      lastReason = f.reason;
      continue;
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/json");
    const okResponse = new Response(read.text, {
      status: read.status,
      headers: responseHeaders,
    });
    return { kind: "ok", response: okResponse, status: result.status, model: candidate.id };
  }
  return { kind: "all-failed", attempts, lastReason };
}
