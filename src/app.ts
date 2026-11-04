import { Hono } from "hono";
import { loadConfig, type Config } from "./config.js";
import { ModelCache } from "./cache/modelCache.js";
import { authPassthrough } from "./middleware/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { modelsRoutes } from "./routes/models.js";
import type { FreeModel } from "./types.js";

export interface AppDeps {
  config?: Config;
  cache?: ModelCache;
  fetchFn?: typeof fetch;
  onAttempt?: (model: string, attempt: number) => void;
}

export function createApp(deps: AppDeps = {}) {
  const config = deps.config ?? loadConfig();
  const cache = deps.cache ?? new ModelCache();
  deps.cache ?? void cache.refresh(); // warm up if caller didn't pass one
  const getModels: () => FreeModel[] = () => cache.get();

  const app = new Hono();
  app.use("*", authPassthrough);
  app.route("/", modelsRoutes(getModels));
  app.route("/", chatRoutes({ config, getModels, fetchFn: deps.fetchFn, onAttempt: deps.onAttempt }));
  return app;
}
