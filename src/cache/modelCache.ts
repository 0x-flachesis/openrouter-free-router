import { fetchFreeModels } from "../services/modelList.js";
import type { FreeModel } from "../types.js";

export class ModelCache {
  private models: FreeModel[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  get(): FreeModel[] {
    return this.models;
  }

  async refresh(): Promise<void> {
    try {
      const fresh = await fetchFreeModels();
      this.models = fresh;
    } catch (err) {
      // Keep stale cache on failure, never empty it out.
      console.warn("[modelCache] refresh failed, keeping stale cache:", String(err));
    }
  }

  start(intervalMs: number): void {
    this.stop();
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
