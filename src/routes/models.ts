import { Hono } from "hono";
import type { FreeModel } from "../types.js";

export function modelsRoutes(getModels: () => FreeModel[]) {
  const app = new Hono();
  app.get("/v1/models", (c) => {
    const models = getModels();
    return c.json({
      object: "list",
      data: models.map((m) => ({
        id: m.id,
        object: "model",
        created: m.created,
        owned_by: m.id.split("/")[0] ?? "openrouter",
        context_length: m.context_length,
      })),
    });
  });
  app.get("/health", (c) => c.json({ ok: true, models: getModels().length }));
  return app;
}
