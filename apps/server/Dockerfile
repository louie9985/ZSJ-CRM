# 多阶段构建：pnpm workspace 构建 shared-core + server，产物跑在 node:22-slim（对齐技术选型）
FROM node:22-slim AS builder
WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared-core/package.json packages/shared-core/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm --filter @zsj/shared-core build \
  && pnpm --filter @zsj/server exec prisma generate \
  && pnpm --filter @zsj/server build

FROM node:22-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /repo /repo
EXPOSE 3000
CMD ["node", "apps/server/dist/main.js"]
