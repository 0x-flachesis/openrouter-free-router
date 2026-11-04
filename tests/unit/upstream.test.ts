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
});
