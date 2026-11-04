import { describe, it, expect } from "vitest";
import {
  isContextLengthErrorMessage,
  classifyUpstreamError,
} from "../../src/services/errors.js";

describe("isContextLengthErrorMessage", () => {
  it("detects context length phrasing", () => {
    expect(isContextLengthErrorMessage("This model has a maximum context length of 32768 tokens")).toBe(true);
    expect(isContextLengthErrorMessage("Prompt is too long")).toBe(true);
    expect(isContextLengthErrorMessage("tokens exceed context window")).toBe(true);
  });
  it("rejects unrelated messages", () => {
    expect(isContextLengthErrorMessage("Invalid role")).toBe(false);
    expect(isContextLengthErrorMessage("Rate limit exceeded")).toBe(false);
  });
});

describe("classifyUpstreamError", () => {
  it("400 context-length -> context-length", () => {
    const f = classifyUpstreamError(400, JSON.stringify({ error: { message: "maximum context length exceeded" } }));
    expect(f.kind).toBe("context-length");
  });
  it("400 other -> client-error", () => {
    const f = classifyUpstreamError(400, JSON.stringify({ error: { message: "bad role" } }));
    expect(f.kind).toBe("client-error");
  });
  it("429 -> retryable", () => {
    const f = classifyUpstreamError(429, "rate limited");
    expect(f.kind).toBe("retryable");
  });
  it("500 -> retryable", () => {
    const f = classifyUpstreamError(500, "boom");
    expect(f.kind).toBe("retryable");
  });
});
