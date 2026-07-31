# ORM-PRISMA-01：全项目 Prisma 重构

- Owner：数据库基础设施与各平台模块 Owner
- 状态：实现完成；真实 PostgreSQL 环境验收待补
- 允许修改路径：按《全项目 Prisma 重构方案与执行计划》工作包分配；共享组合根、`packages/database` 和迁移入口必须单 Owner
- 权威依据：根 `AGENTS.md`、ADR-0028、`docs/04-工程手册/全项目Prisma重构方案与执行计划.md`

## 已知事实

- 项目负责人已决定全项目采用 Prisma，并停止新增 Drizzle 实现。
- 重构前有七个 Drizzle 依赖包、六份 Drizzle Schema、十个 PostgreSQL 持久化模块和十五份不可改写的历史 SQL migration。
- 当前生产默认 Runtime 已切换为 Prisma；显式 Legacy pg Runtime 仅保留主动查询取消能力与测试。

## 允许的假设

- 历史 ADR 和 handoff 可保留 Drizzle 决策记录，但运行依赖和实现不得恢复。
- Prisma 无法表达的 PostgreSQL 特性可使用受控参数化 Raw Query 或 migration SQL。

## 禁止的假设

- 不修改、重排或伪造已执行 migration。
- 不导出 Prisma Client、生成模型/输入、查询参数或 Transaction Client。
- 不创建跨模块关系、共享 Repository、双写或新的 CRM 模型。
- 不在共享环境使用 `prisma db push`。

## 非目标

- 不改变业务语义、表列命名、ID、状态、权限或部署拓扑。
- 不在单个工作包内一次性替换全仓。

## 决策

- 依次执行 ORM-00～ORM-06，以 G-ORM-0～G-ORM-6 为合并门。
- 历史迁移保持原样；Prisma Schema 产生的候选差异按项目全局编号追加，不建立第二套 migration history。
- 模块切换不双写，以原行为测试和真实 PostgreSQL 证据验收。

## 验证结果

- Prisma 7.9.1、10 个模块片段、47 个模型、默认 Prisma Runtime、生成/边界检查和 Drizzle 清理已经完成；ORM 切换本身没有数据库 DDL，因此未修改或执行新的 migration。
- `pnpm repo:check` 通过，90 项仓库结构、边界、契约和部署基础检查全部成功。
- `pnpm check` 两次均进入全仓 Turbo 阶段：第一次因 Vitest Worker IPC `ERR_IPC_CHANNEL_CLOSED` 中止，单独复跑 `platform-notifications` 后 19 项通过；第二次在 `platform-authorization` Redis 集成测试因当前测试 Redis 不可用而返回 `AUTHORIZATION_CACHE_UNAVAILABLE`，该包其余 52 项通过。未把环境故障误修为 ORM 变更。
- `platform-authorization` 已独立通过 build、lint、typecheck、contracts:check；使用缺失 Secret 文件覆盖关闭 Redis 集成条件后，单元测试 52 项通过、6 项环境集成测试跳过。
- 当前环境没有 Docker 命令，也没有测试 PostgreSQL 连接；空库执行十五份历史 migration 后的 Prisma drift、锁/并发和执行计划证据尚未产生，必须在可用环境补齐。

## 未解决问题

- 仅剩依赖外部环境的真实 PostgreSQL 验收：空库重建、当前基线升级、Prisma drift、Outbox/Inbox 并发和关键查询计划。
