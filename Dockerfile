# syntax = docker/dockerfile:1

# Pinned to the exact node version mise.toml pins for local dev, so the
# built-in TypeScript stripping and node:sqlite behave the same in both
# places. The app has no runtime dependencies (node:http, node:sqlite,
# node:crypto, node:fs are all built in), so there's no install step and no
# build step: Node runs src/*.ts directly.
FROM docker.io/library/node:24.21.0-alpine

WORKDIR /app
COPY README.md ./
COPY src/ ./src/

EXPOSE 8080
CMD ["node", "src/server.ts"]
