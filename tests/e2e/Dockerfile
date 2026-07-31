FROM node:24.15.0-bookworm-slim AS build

WORKDIR /workspace
RUN npm install --global pnpm@9.15.0
COPY . .
RUN --mount=type=cache,id=ai-crm-e2e-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile \
    && pnpm --filter "@ai-crm/e2e..." build \
    && pnpm --filter @ai-crm/e2e deploy --prod /opt/application \
    && test -f /opt/application/dist/api-main.js \
    && test -f /opt/application/dist/worker-main.js

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=test
WORKDIR /app
COPY --from=build --chown=node:node /opt/application/ ./
COPY --from=build --chown=node:node /workspace/packages/database/migrations ./packages/database/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/app-registry/migrations ./packages/platform-modules/app-registry/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/audit/migrations ./packages/platform-modules/audit/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/authorization/migrations ./packages/platform-modules/authorization/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/business-configuration/migrations ./packages/platform-modules/business-configuration/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/eventing-outbox/migrations ./packages/platform-modules/eventing-outbox/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/file-center/migrations ./packages/platform-modules/file-center/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/form-schema/migrations ./packages/platform-modules/form-schema/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/notifications/migrations ./packages/platform-modules/notifications/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/organization/migrations ./packages/platform-modules/organization/migrations
COPY --from=build --chown=node:node /workspace/packages/platform-modules/task-center/migrations ./packages/platform-modules/task-center/migrations
COPY --from=build --chown=node:node /workspace/tests/e2e/worker-entrypoint.sh ./worker-entrypoint.sh
RUN chmod 0500 ./worker-entrypoint.sh
USER node
CMD ["node", "dist/api-main.js"]
