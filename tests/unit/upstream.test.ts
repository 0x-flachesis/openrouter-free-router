import { describe, it, expect, vi } from "vitest";
import { callUpstream } from "../../src/services/upstream.js";
import { loadConfig } from "../../src/config.js";

const config = loadConfig();

describe("callUpstream", () => {
  it("throws retryable on timeout error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const out = await callUpstream({ model: "m", body: {}, config, fetchFn });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("retryable");
  });

  it("throws retryable on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const out = await callUpstream({ model: "m", body: {}, config, fetchFn });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("retryable");
  });
  it("body AbortError without client cancel is retryable", async () => {
    const errStream = new ReadableStream({
      start(c) { c.error(new DOMException("aborted", "AbortError")); },
    });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(errStream, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const controller = new AbortController();
    const { readNonStreamingResponse } = await import("../../src/services/upstream.js");
    const res = await fetchFn({} as any);
    const out = await readNonStreamingResponse(res, controller.signal);
    expect(controller.signal.aborted).toBe(false);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.kind).toBe("retryable");
  });

});
