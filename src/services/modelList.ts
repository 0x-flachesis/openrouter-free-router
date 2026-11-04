import type { FreeModel, OpenRouterModel } from "../types.js";

export const MODELS_URL = "https://openrouter.ai/api/v1/models";

export function isFreeModel(m: OpenRouterModel): boolean {
  return m.pricing?.prompt === "0" && m.pricing?.completion === "0";
}

/**
 * Sort by context_length desc, ties broken by created desc.
 * Mutates nothing: returns a new array.
 */
export function sortFreeModels(models: FreeModel[]): FreeModel[] {
  return [...models].sort((a, b) => {
    if (b.context_length !== a.context_length) {
      return b.context_length - a.context_length;
    }
    return b.created - a.created;
  });
}

export function toFreeModels(models: OpenRouterModel[]): FreeModel[] {
  return sortFreeModels(
    models.filter(isFreeModel).map((m) => ({
      id: m.id,
      name: m.name,
      created: m.created,
      context_length: m.context_length ?? 0,
    })),
  );
}

export async function fetchFreeModels(signal?: AbortSignal): Promise<FreeModel[]> {
  const res = await fetch(MODELS_URL, {
    headers: { "User-Agent": "openrouter-free-router/0.1" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`OpenRouter models API error: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: OpenRouterModel[] };
  if (!Array.isArray(json.data)) {
    throw new Error("Unexpected OpenRouter models response: missing data array");
  }
  return toFreeModels(json.data);
}
