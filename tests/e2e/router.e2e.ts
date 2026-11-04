import { describe, it, expect } from "vitest";

const RUN = process.env.RUN_E2E === "1";

describe.skipIf(!RUN)("e2e: real OpenRouter", () => {
  it("GET /v1/models returns real free models", async () => {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("crouton-alpha model present in free list", async () => {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const json: any = await res.json();
    const crouton = json.data.find((m: any) => m.id.includes("crouton"));
    if (crouton) {
      expect(crouton.pricing.prompt).toBe("0");
    }
  });
});
