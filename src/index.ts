#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { ModelCache } from "./cache/modelCache.js";
import { createApp } from "./app.js";

const config = loadConfig();
const cache = new ModelCache();

await cache.refresh();
cache.start(config.modelRefreshMs);
console.log(`model cache: ${cache.get().length} free models`);

const app = createApp({ config, cache, onAttempt: (m, a) => console.log(`[attempt ${a}] ${m}`) });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`openrouter-free-router listening on http://localhost:${info.port}`);
});

// graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    cache.stop();
    process.exit(0);
  });
}
