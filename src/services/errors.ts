const CONTEXT_KEYWORDS = [
  "context length",
  "max context",
  "maximum context",
  "context window",
  "too long",
  "tokens exceed",
] as const;

export function isContextLengthErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return CONTEXT_KEYWORDS.some((k) => lower.includes(k));
}

export interface OpenRouterErrorBody {
  message: string;
  type?: string;
  code?: string | number;
}

export function parseUpstreamErrorBody(raw: string): OpenRouterErrorBody {
  try {
    const json: any = JSON.parse(raw);
    if (json?.error?.message) {
      return {
        message: String(json.error.message),
        type: json.error.type,
        code: json.error.code,
      };
    }
    if (json?.message) return { message: String(json.message) };
    return { message: raw.slice(0, 500) };
  } catch {
    return { message: raw.slice(0, 500) || "Upstream error" };
  }
}

export type UpstreamFailure =
  | { kind: "context-length"; status: number; body: OpenRouterErrorBody }
  | { kind: "client-error"; status: number; body: OpenRouterErrorBody }
  | { kind: "retryable"; status?: number; reason: string };

export function classifyUpstreamError(
  status: number,
  rawBody: string,
): UpstreamFailure {
  const body = parseUpstreamErrorBody(rawBody);
  if (status === 400 && isContextLengthErrorMessage(body.message)) {
    return { kind: "context-length", status, body };
  }
  if (status >= 400 && status < 500 && status !== 429) {
    return { kind: "client-error", status, body };
  }
  return {
    kind: "retryable",
    status,
    reason: `upstream ${status}: ${body.message}`,
  };
}

export function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted/i.test(String((err as Error | null)?.message ?? ""))
  );
}
