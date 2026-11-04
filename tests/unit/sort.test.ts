import { describe, it, expect } from "vitest";
import { sortFreeModels, toFreeModels } from "../../src/services/modelList.js";

describe("sortFreeModels", () => {
  it("sorts by context_length desc, ties by created desc", () => {
    const models = [
      { id: "a", name: "A", created: 100, context_length: 1000 },
      { id: "b", name: "B", created: 200, context_length: 1000 },
      { id: "c", name: "C", created: 50, context_length: 5000 },
    ];
    const sorted = sortFreeModels(models);
    expect(sorted.map((m) => m.id)).toEqual(["c", "b", "a"]);
  });
});

describe("toFreeModels", () => {
  it("filters non-free models", () => {
    const models = [
      { id: "x/free", name: "X", created: 10, context_length: 100, pricing: { prompt: "0", completion: "0" } },
      { id: "y", name: "Y", created: 20, context_length: 9999, pricing: { prompt: "1", completion: "1" } },
      { id: "z/free", name: "Z", created: 30, context_length: 200, pricing: { prompt: "0", completion: "0" } },
    ];
    const free = toFreeModels(models as any);
    expect(free.map((m) => m.id)).toEqual(["z/free", "x/free"]);
  });
});
