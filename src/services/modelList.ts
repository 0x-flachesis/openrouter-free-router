import type { FreeModel, OpenRouterModel } from "../types.js";

export const MODELS_URL = "https://openrouter.ai/api/v1/models";

export function isFreeModel(m: OpenRouterModel): boolean {
  return m.pricing?.prompt === "0" && m.pricing?.completion === "0";
}

/**
 * Tot僅保留會做文字對話的模型。
 *
 * - 排除輸出為 audio/image/video 的模型 (例如音樂生成模型)
 * - 排除 guardrail / content-safety 分類器 (例如 nemotron-content-safety)
 *
 * `architecture` 若缺失或無 `output_modalities` 時保留，避免誤殺。
 */
export function isChatModel(m: OpenRouterModel): boolean {
  const id = m.id.toLowerCase();
  const name = (m.name ?? "").toLowerCase();
  if (id.includes("content-safety") || id.includes("guardrail") || id.includes("moderation")) return false;
  if (name.includes("content safety") || name.includes("guardrail") || name.includes("moderation")) return false;

  const outputs = m.architecture?.output_modalities;
  if (!outputs || outputs.length === 0) return true;
  const nonTextOutputs = outputs.some((x) => x !== "text");
  if (nonTextOutputs) return false;
  return outputs.includes("text");
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
    models.filter(isFreeModel).filter(isChatModel).map((m) => ({
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
