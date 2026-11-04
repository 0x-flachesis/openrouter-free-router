# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN pnpm exec tsc --moduleResolution node16 --module node16 --outDir dist \
    --rootDir src --preserveSymlinks false

FROM node:24-bookworm-slim AS runner
LABEL org.opencontainers.image.title="openrouter-free-router" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.description="OpenAI-compatible router that forwards to free OpenRouter models with fallback"

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production
ENV PORT=3000

RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
