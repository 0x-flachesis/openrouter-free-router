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
  code: number;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export function parseUpstreamErrorBody(raw: string): OpenRouterErrorBody | null {
  try {
    const json: any = JSON.parse(raw);
    if (!json?.error?.message) return null;
    return {
      code: Number(json.error.code),
      message: String(json.error.message),
      type: json.error.type,
      metadata: json.error.metadata,
    };
  } catch {
    return null;
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
  const parsed = parseUpstreamErrorBody(rawBody);
  const body: OpenRouterErrorBody = parsed ?? {
    code: status,
    message: rawBody.slice(0, 500) || "Upstream error",
  };

  if (status >= 400 && status < 500 && status !== 429) {
    if (status === 400 && isContextLengthErrorMessage(body.message)) {
      return { kind: "context-length", status, body };
    }
    return { kind: "client-error", status, body };
  }

  return {
    kind: "retryable",
    status,
    reason: `upstream ${status}: ${body.message}`,
  };
}

export function classifyUpstreamSuccessBody(
  status: number,
  rawBody: string,
): UpstreamFailure | null {
  const parsed = parseUpstreamErrorBody(rawBody);
  if (!parsed) return null;
  const effective = Number.isInteger(parsed.code) && parsed.code >= 100 && parsed.code < 600
    ? parsed.code
    : status;
  return classifyUpstreamError(effective, rawBody);
}

export function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted/i.test(String((err as Error | null)?.message ?? ""))
  );
}
