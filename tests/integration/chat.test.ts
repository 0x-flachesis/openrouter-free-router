import { describe, it, expect, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { ModelCache } from "../../src/cache/modelCache.js";
import { loadConfig } from "../../src/config.js";

function buildApp(fetchFn: typeof fetch) {
  const cache = new ModelCache();
  (cache as any).models = [
    { id: "m1/free", name: "M1", created: 100, context_length: 1000 },
  ];
  return createApp({ config: loadConfig(), cache, fetchFn });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST" as const,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

describe("POST /v1/chat/completions", () => {
  it("400 when messages missing", async () => {
    const app = buildApp(vi.fn() as any);
    const res = await app.request("/v1/chat/completions", post({}));
    expect(res.status).toBe(400);
  });

  it("503 when no models cached", async () => {
    const cache = new ModelCache();
    const app = createApp({ config: loadConfig(), cache, fetchFn: vi.fn() as any });
    const res = await app.request("/v1/chat/completions", post({ messages: [] }));
    expect(res.status).toBe(503);
  });

  it("non-streaming success forwards upstream body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = buildApp(fetchFn as any);
    const res = await app.request(
      "/v1/chat/completions",
      post({ messages: [{ role: "user", content: "hi" }], temperature: 0.7 }),
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.choices[0].message.content).toBe("hi");
    // temperature passthrough check
    const sent = JSON.parse((fetchFn.mock.calls[0]![1] as any).body);
    expect(sent.temperature).toBe(0.7);
    expect(sent.model).toBe("m1/free");
  });

  it("streaming returns SSE and terminates with [DONE]", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('data: {"a":1}\n\n', { status: 200 }),
    );
    const app = buildApp(fetchFn as any);
    const res = await app.request("/v1/chat/completions", post({ messages: [], stream: true }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('data: {"a":1}');
    expect(text).toContain("data: [DONE]");
  });

  it("context-length 400 maps to code context_length_exceeded", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "maximum context length exceeded" } }), { status: 400 }),
    );
    const app = buildApp(fetchFn as any);
    const res = await app.request("/v1/chat/completions", post({ messages: [] }));
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error.code).toBe("context_length_exceeded");
  });

  it("all-failed maps to 502", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("rate", { status: 429 }));
    const app = buildApp(fetchFn as any);
    const res = await app.request("/v1/chat/completions", post({ messages: [] }));
    expect(res.status).toBe(502);
    const json: any = await res.json();
    expect(json.error.code).toBe("all_models_failed");
  });

  it("forwards client Authorization header upstream as Bearer key", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    const app = buildApp(fetchFn as any);
    const res = await app.request(
      "/v1/chat/completions",
      post({ messages: [] }, { Authorization: "Bearer my-openrouter-key" }),
    );
    expect(res.status).toBe(200);
    const headers = (fetchFn.mock.calls[0]![1] as any).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer my-openrouter-key");
  });

  it("upstream 401 (missing key) is returned as-is", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "No cookie auth credentials found" } }), { status: 401 }),
    );
    const app = buildApp(fetchFn as any);
    const res = await app.request("/v1/chat/completions", post({ messages: [] }));
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.error.message).toContain("No cookie auth credentials found");
  });
});
