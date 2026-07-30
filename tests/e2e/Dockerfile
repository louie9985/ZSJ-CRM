# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS build

WORKDIR /workspace
RUN npm install --global pnpm@9.15.0
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter "@ai-crm/e2e..." build \
    && pnpm --filter @ai-crm/e2e deploy --prod /opt/application \
    && test -f /opt/application/dist/api-main.js \
    && test -f /opt/application/dist/worker-main.js

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=test
WORKDIR /app
COPY --from=build --chown=node:node /opt/application/ ./
USER node
CMD ["node", "dist/api-main.js"]
