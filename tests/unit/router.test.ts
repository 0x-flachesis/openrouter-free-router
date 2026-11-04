import { describe, it, expect, vi } from "vitest";
import { routeChatCall } from "../../src/services/router.js";
import { loadConfig } from "../../src/config.js";

const config = { ...loadConfig(), requestTimeoutMs: 60000 };
const models = [
  { id: "m1", name: "M1", created: 300, context_length: 3000 },
  { id: "m2", name: "M2", created: 200, context_length: 2000 },
  { id: "m3", name: "M3", created: 100, context_length: 1000 },
];

function resp(status: number, body: string) {
  return new Response(body, { status });
}
function jsonResp(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

describe("routeChatCall", () => {
  it("succeeds on first model", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResp(200, { ok: true }));
    const out = await routeChatCall({ body: { messages: [] }, models, config, fetchFn });
    expect(out.kind).toBe("ok");
    expect((out as any).model).toBe("m1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("falls back on 429/500 to next model", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(resp(500, "err"))
      .mockResolvedValueOnce(jsonResp(200, { ok: true }));
    const out = await routeChatCall({ body: { messages: [] }, models, config, fetchFn });
    expect(out.kind).toBe("ok");
    expect((out as any).model).toBe("m3");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("does NOT fallback on 400 context-length", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResp(400, { error: { message: "maximum context length exceeded" } }),
    );
    const out = await routeChatCall({ body: { messages: [] }, models, config, fetchFn });
    expect(out.kind).toBe("context-length");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT fallback on other 400", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResp(400, { error: { message: "bad role" } }),
    );
    const out = await routeChatCall({ body: { messages: [] }, models, config, fetchFn });
    expect(out.kind).toBe("client-error");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns all-failed when every model fails", async () => {
    const fetchFn = vi.fn().mockResolvedValue(resp(429, "rate"));
    const out = await routeChatCall({ body: { messages: [] }, models, config, fetchFn });
    expect(out.kind).toBe("all-failed");
    expect((out as any).attempts).toBe(3);
  });

  it("tries all free candidates without a fixed attempt limit", async () => {
    const fetchFn = vi.fn().mockResolvedValue(resp(503, "down"));
    const out = await routeChatCall({
      body: { messages: [] },
      models,
      config,
      fetchFn,
    });
    expect(out.kind).toBe("all-failed");
    expect((out as any).attempts).toBe(3);
  });

  it("strips client models from upstream payload", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResp(200, {}));
    await routeChatCall({ body: { messages: [], models: ["paid/model"] }, models, config, fetchFn });
    const sent = JSON.parse((fetchFn.mock.calls[0]![1] as any).body);
    expect(sent.models).toBeUndefined();
    expect(sent.model).toBe("m1");
  });

  it("tries free candidates before user fallback models", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(jsonResp(200, {}));
    const out = await routeChatCall({
      body: { messages: [], models: ["paid/fallback"] },
      models,
      config,
      fetchFn,
    });
    expect((out as any).model).toBe("paid/fallback");
    expect(fetchFn).toHaveBeenCalledTimes(4);
    const calledModels = fetchFn.mock.calls.map((c) => JSON.parse((c[1] as any).body).model);
    expect(calledModels).toEqual(["m1", "m2", "m3", "paid/fallback"]);
  });

  it("stops at user fallback for context-length", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(resp(429, "rate"))
      .mockResolvedValueOnce(jsonResp(400, { error: { message: "maximum context length exceeded" } }));
    const out = await routeChatCall({
      body: { messages: [], models: ["paid/fallback"] },
      models,
      config,
      fetchFn,
    });
    expect(out.kind).toBe("context-length");
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("forwards Authorization only when provided", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResp(200, {}));
    await routeChatCall({ body: { messages: [] }, apiKey: "secret", models, config, fetchFn });
    const headers = (fetchFn.mock.calls[0]![1] as any).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer secret");
  });

  it("sets default HTTP-Referer / X-Title headers", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResp(200, {}));
    await routeChatCall({ body: { messages: [] }, models, config, fetchFn });
    const headers = (fetchFn.mock.calls[0]![1] as any).headers as Headers;
    expect(headers.get("HTTP-Referer")).toBe("https://flachesis.org");
    expect(headers.get("X-Title")).toBe("OpenCode");
  });
});
