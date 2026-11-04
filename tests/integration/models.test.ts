import { describe, it, expect } from "vitest";
import { createApp } from "../../src/app.js";
import { ModelCache } from "../../src/cache/modelCache.js";
import { loadConfig } from "../../src/config.js";

const models = [
  { id: "big/free", name: "Big", created: 200, context_length: 3000 },
  { id: "small/free", name: "Small", created: 300, context_length: 1000 },
];

async function buildApp() {
  const cache = new ModelCache();
  (cache as any).models = models;
  return createApp({ config: loadConfig(), cache });
}

describe("GET /v1/models + /health", () => {
  it("returns OpenAI-style list sorted", async () => {
    const app = await buildApp();
    const res = await app.request("/v1/models");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.object).toBe("list");
    expect(json.data.map((m: any) => m.id)).toEqual(["big/free", "small/free"]);
  });

  it("GET /health returns ok + count", async () => {
    const app = await buildApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json).toEqual({ ok: true, models: 2 });
  });
});
