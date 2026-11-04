function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface Config {
  port: number;
  maxAttempts: number;
  modelRefreshMs: number;
  requestTimeoutMs: number;
  referer: string;
  title: string;
}

export function loadConfig(): Config {
  return {
    port: num("PORT", 3000),
    maxAttempts: num("MAX_ATTEMPTS", 10),
    modelRefreshMs: num("MODEL_REFRESH_MS", 60000),
    requestTimeoutMs: num("REQUEST_TIMEOUT_MS", 60000),
    referer: process.env.OPENROUTER_REFERER || "https://flachesis.org",
    title: process.env.OPENROUTER_TITLE || "OpenCode",
  };
}
