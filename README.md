# openrouter-free-router

OpenAI-compatible router that forwards chat completions to free OpenRouter models,
with priority ordering and automatic failover.

## How it works

1. Fetches `GET https://openrouter.ai/api/v1/models` and filters to free models
   (`pricing.prompt === "0" && pricing.completion === "0"`).
2. Sorts by `context_length` descending, ties broken by `created` descending.
3. On `POST /v1/chat/completions`, tries models in order:
   - Success → stream / return response.
   - `429 / 5xx / timeout / network error` → try next model.
   - `400 context length exceeded` → return 400 immediately (switching to a
     smaller model cannot succeed).
   - Other 4xx → return upstream error as-is.
   - All failed → `502`.

## Endpoints

- `POST /v1/chat/completions` — OpenAI Chat Completions compatible (streaming SSE supported)
- `GET /v1/models` — sorted free model list
- `GET /health` — health check

## Setup

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm test     # unit + integration
pnpm test:e2e # real upstream, needs RUN_E2E=1
```

## Config (env)

| Var | Default |
|---|---|
| `PORT` | `3000` |
| `MAX_ATTEMPTS` | `10` |
| `MODEL_REFRESH_MS` | `60000` |
| `REQUEST_TIMEOUT_MS` | `60000` |
| `OPENROUTER_REFERER` | `https://flachesis.org` |
| `OPENROUTER_TITLE` | `OpenCode` |

Client `Authorization: Bearer <OpenRouter key>` is forwarded upstream when present.
