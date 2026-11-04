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

  it("filters out non-text audio generators (lyria)", () => {
    const models = [
      { id: "google/lyria-3-pro-preview", name: "Lyria 3 Pro", created: 10, context_length: 1048576, pricing: { prompt: "0", completion: "0" }, architecture: { modality: "text+image->text+audio", output_modalities: ["text", "audio"] } },
      { id: "stealth/crouton-alpha", name: "Crouton Alpha", created: 20, context_length: 1048576, pricing: { prompt: "0", completion: "0" }, architecture: { modality: "text+image+file+audio+video->text", output_modalities: ["text"] } },
    ];
    const free = toFreeModels(models as any);
    expect(free.map((m) => m.id)).toEqual(["stealth/crouton-alpha"]);
  });

  it("filters out content-safety guardrails even though output is text", () => {
    const models = [
      { id: "nvidia/nemotron-3.5-content-safety:free", name: "Nemotron Content Safety", created: 10, context_length: 128000, pricing: { prompt: "0", completion: "0" }, architecture: { modality: "text+image->text", output_modalities: ["text"] } },
      { id: "liquid/lfm-2.5-2.6b:free", name: "LFM 2.5", created: 20, context_length: 65536, pricing: { prompt: "0", completion: "0" }, architecture: { modality: "text->text", output_modalities: ["text"] } },
    ];
    const free = toFreeModels(models as any);
    expect(free.map((m) => m.id)).toEqual(["liquid/lfm-2.5-2.6b:free"]);
  });

  it("keeps chat models with missing architecture for backwards compatibility", () => {
    const models = [
      { id: "x/free", name: "X", created: 10, context_length: 100, pricing: { prompt: "0", completion: "0" } },
    ];
    const free = toFreeModels(models as any);
    expect(free.map((m) => m.id)).toEqual(["x/free"]);
  });
});
