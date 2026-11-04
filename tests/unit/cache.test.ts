import { describe, it, expect, vi } from "vitest";
import { ModelCache } from "../../src/cache/modelCache.js";

vi.mock("../../src/services/modelList.js", () => ({
  fetchFreeModels: vi.fn(),
}));

import { fetchFreeModels } from "../../src/services/modelList.js";

describe("ModelCache", () => {
  it("starts empty and refresh populates", async () => {
    const cache = new ModelCache();
    expect(cache.get()).toEqual([]);
    (fetchFreeModels as any).mockResolvedValueOnce([{ id: "m1", name: "M1", created: 1, context_length: 10 }]);
    await cache.refresh();
    expect(cache.get()).toHaveLength(1);
  });

  it("keeps stale cache on refresh failure", async () => {
    const cache = new ModelCache();
    (fetchFreeModels as any).mockResolvedValueOnce([{ id: "keep", name: "K", created: 1, context_length: 5 }]);
    await cache.refresh();
    (fetchFreeModels as any).mockRejectedValueOnce(new Error("down"));
    await cache.refresh();
    expect(cache.get().map((m) => m.id)).toEqual(["keep"]);
  });
});
