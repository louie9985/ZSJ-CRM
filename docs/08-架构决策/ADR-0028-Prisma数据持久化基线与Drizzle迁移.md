# ADR-0028：Prisma 数据持久化基线与 Drizzle 迁移

- 状态：已接受
- 日期：2026-07-31
- 决策人：项目负责人
- 适用范围：应用数据持久化、模块数据所有权、事务、迁移、测试和数据库访问
- 替代决策：ADR-0011 中关于 Drizzle ORM、Drizzle Schema 和 Drizzle Kit 的选择
- 保留决策：ADR-0011 中关于 PostgreSQL、模块所有权、事务、Outbox/Inbox、版本化 SQL 迁移、安全、可观测性和真实数据库测试的约束

## 已知事实

- 项目负责人要求全项目统一使用 Prisma，不再以 Drizzle 作为默认 ORM 或 Schema 工具。
- 当前仓库已经存在 Drizzle 依赖、六份 Drizzle Schema 源码、共享数据库运行时、十五份已提交 SQL 迁移，以及大量直接使用参数化 SQL 的模块 Repository。
- 已执行或可能已执行的历史 SQL 迁移是数据库历史事实，不能为了更换 ORM 而改写、重排或删除。
- 模块不得跨模块查询或修改表；ORM 生成类型和事务句柄不得成为 HTTP、事件、`platform-sdk` 或模块公共契约。
- Transactional Outbox/Inbox 必须继续与模块本地状态变更处于同一个 PostgreSQL 事务。

## 允许的假设

- Prisma ORM 和 Prisma Migrate 可在 Node 24、当前 PostgreSQL 基线及 pnpm Monorepo 中使用，但具体版本必须由兼容性验证后锁定。
- Prisma Schema 可以按模块维护源片段，并由确定性工具生成或校验唯一部署 Schema；生成物不得成为人工并行编辑的事实源。
- Prisma 无法完整表达的 PostgreSQL 触发器、检查约束、部分索引、权限、Advisory Lock 和并发查询，可以保留在模块 Repository 或经评审的 SQL migration 中。
- 迁移期间可短期同时存在 Prisma 与 Drizzle 实现，但一个运行路径只能有一个持久化实现，且共存必须有 Owner、期限、测试和清理门。

## 禁止的假设

- 不因为使用 Prisma 就建立跨模块的通用数据模型、万能 Repository 或可被任意模块调用的全局数据库服务。
- 不导出 `PrismaClient`、模型生成类型、查询参数、`Prisma.TransactionClient`、Raw Query、数据库行类型或底层连接句柄作为模块公共契约。
- 不把 Prisma relation 当作跨模块所有权许可；不同模块表之间仍不建立外键、隐式 Join 或级联写入。
- 不在应用启动时运行迁移，不在共享测试、预发布或生产使用 `prisma db push`、自动 Schema Sync 或未评审的 DDL。
- 不通过 `prisma migrate reset`、删除迁移历史、重建有数据环境或修改已执行 SQL 来完成 ORM 切换。
- 不假设 Prisma 自动解决授权、审计、幂等、事务传播、并发竞争、查询计划、迁移兼容或敏感数据脱敏。
- 不从现有表或旧 Drizzle Schema 推导新的 CRM 实体、字段、状态或业务规则。

## 决策

### 1. 全项目默认使用 Prisma

TypeScript 应用统一使用 Prisma ORM 进行类型化数据访问。Drizzle ORM 和 Drizzle Kit 在迁移完成后从根依赖、模块依赖、源码、构建脚本和锁文件中移除，并通过仓库检查禁止重新引入。

`packages/database` 负责 Prisma Client 生命周期、连接配置、健康检查、事务上下文、错误归一化、可观测性和测试辅助。它不得汇总领域规则或向模块公开 Prisma Client。

### 2. Schema 按模块拥有，部署模型确定性组合

- 每个拥有数据的模块维护自己的 Prisma Schema 源片段、Repository 和映射器。
- 根级生成工具按稳定顺序组合 datasource/generator 与模块片段，生成唯一的部署 Schema 和 Prisma Client；组合结果必须可重复生成并由 CI 校验无漂移。
- 模型必须显式映射到模块自有 PostgreSQL Schema 和表名。模块边界检查阻止其他模块导入其 Prisma 源片段、生成类型或 Repository。
- 若所选 Prisma 版本原生多文件 Schema 已通过兼容性验证，可以直接使用；否则使用仓库内确定性组合器。不得要求多个工作包直接编辑一个共享巨型 Schema 文件。

### 3. Prisma 类型只属于基础设施实现

模块公开接口继续返回领域模型或契约模型。Repository 在内部完成 Prisma 记录与领域模型的映射。授权 Data Scope 仍是结构化、供应商中立的约束，由资源拥有模块转换为本地查询，不得返回 Prisma `where` 对象。

### 4. 事务和 Outbox/Inbox 保持原有语义

- `packages/database` 提供供应商中立的事务运行器；模块内部 Adapter 可在该上下文中使用当前 Prisma Transaction Client，但不得向公共入口暴露它。
- 本地状态与 Outbox 追加、消费状态与 Inbox 完成记录必须由真实 PostgreSQL 集成测试证明原子提交。
- 远程系统调用仍不得包进数据库事务；继续使用幂等、重试、可恢复状态和对账。
- Prisma 交互式事务的超时、连接占用、嵌套调用和取消语义必须在替换现有运行时前形成测试证据。

### 5. 复杂 PostgreSQL 能力使用受控 Raw SQL

Prisma 是默认访问方式，但不是禁止 SQL。以下场景允许在拥有模块的 Repository 内使用 Prisma 参数化 Raw Query，或在 migration 中使用 SQL：

- `FOR UPDATE SKIP LOCKED`、Advisory Lock、复杂 CTE 和批量状态抢占。
- Prisma Schema 不能完整表达的检查约束、部分索引、触发器、数据库角色和授权。
- 经执行计划证明需要的 PostgreSQL 特有查询。

动态标识符必须来自封闭白名单，外部输入不得通过不安全字符串拼接进入 SQL。禁止使用不安全 Raw API 绕过参数化。

### 6. Prisma Schema 产生候选差异，项目 SQL Runner 负责部署

- 新迁移以组合后的 Prisma Schema 为目标模型，使用 Prisma CLI 的 Schema diff/migration 能力产生候选 SQL。候选 SQL 经人工评审和必要编辑后，按项目全局十位版本号写入所属模块 `migrations/`，并提供同名 review metadata。
- 部署只执行已提交、校验过的迁移制品，使用专用 DDL 凭据和全局互斥；API 与 Worker 启动不执行迁移。
- 已执行的历史 SQL 迁移及 `ai_crm_migrations.applied_migrations` 记录保留为历史基线。ORM 切换不创建数据库结构变化，因此不伪造 `_prisma_migrations` 或历史 Prisma migration 状态。
- 现有项目 SQL Runner 继续作为唯一生产部署入口，统一执行历史 SQL 与后续由 Prisma Schema 差异产生、经评审并纳入全局编号的 SQL；不并行引入第二套 migration history。
- 共享环境禁止 `prisma db push`、`prisma migrate dev` 和 `prisma migrate deploy`。这些命令不得绕过项目全局编号、metadata、Checksum、Advisory Lock、兼容性和恢复检查。

### 7. 分阶段迁移，不进行双写

迁移按“基础设施试点 → 模块逐个替换 → 统一迁移链 → 清理 Drizzle”推进。每个模块在切换时使用同一数据库结构和同一组行为测试；不通过 Prisma 与 Drizzle 双写来比较结果，避免产生两个事实写入者。

每个模块必须完成：Schema 映射、Repository 替换、事务/并发验证、查询计划检查、集成测试、公共导出检查和回滚说明。模块切换失败时回滚应用实现，不回滚或重写数据库历史。

## 已考虑的方案

### 继续使用 Drizzle

现有实现改动最小，SQL 显式且模块 Schema 易拆分，但不符合项目负责人统一使用 Prisma 的当前要求，因此不采用。

### 一次性全量替换

表面上周期短，但会同时改变 Client、Schema、事务和迁移执行链，难以定位回归，也无法为 Outbox/Inbox 和复杂约束提供逐模块证据，因此不采用。

### Prisma 与 Drizzle 长期并存

可以降低短期迁移压力，但会形成两套类型、迁移和审查规则，违背统一技术栈目标，因此只允许受控的临时共存。

### Prisma 统一访问，保留模块边界与受控 SQL

满足统一技术栈要求，同时保留 PostgreSQL 能力、模块所有权和迁移治理，因此采用。

## 影响

- 已实现 Prisma Schema 组合/校验、Client 生成、事务适配和错误映射；后续升级仍须保持这些门禁。
- 现有直接 SQL Repository 不会仅因安装 Prisma 自动完成迁移；必须逐模块改写或封装为 Prisma 参数化 Raw Query。
- 数据库触发器、检查约束、部分索引和权限仍以 SQL migration 为事实，CI 必须防止 Prisma introspection 或格式化丢失这些能力。
- Prisma Client 生成和 Schema 组合会成为构建前置步骤，需要缓存、版本锁定和生成物一致性检查。
- 迁移期间 `pnpm check` 需要同时阻止新 Drizzle 使用并允许已登记的待迁移文件，清理门通过后改为零容忍。

## 验收条件

- 锁定的 Prisma 版本通过 Node 24、PostgreSQL、Docker/CI 与生产镜像构建验证。
- 空库可从全部历史迁移升级到最新版本，现有数据库可从切换前基线升级，Schema 无未声明漂移。
- 所有持久化模块的功能、授权、审计、幂等、并发、事务和失败测试通过。
- Outbox/Inbox 原子性、`SKIP LOCKED` 抢占、唯一约束冲突和死锁/超时边界使用真实 PostgreSQL 验证。
- 公共入口不暴露 Prisma 或数据库供应商类型。
- 根依赖、模块依赖、非历史源码和锁文件不再包含 Drizzle；仓库检查能阻止重新引入。
- `pnpm check` 通过。

## 已落实的工程选择

- Prisma ORM、CLI、Client 和 `@prisma/adapter-pg` 锁定为 `7.9.1`，Node 24 兼容性已验证。
- 模块维护私有 Schema 片段，仓库确定性组合器生成 `prisma/schema.prisma`。
- Prisma Client 在构建/检查前生成到 `packages/database/src/generated/prisma`，生成源码不入库，编译产物随 `packages/database` 输出。
- 根公共 `createDatabaseRuntime` 默认创建 Prisma Runtime；原生 `pg` Runtime 仅作为显式 Legacy/真实主动查询取消测试入口，不再是生产默认。
- Prisma Runtime 支持调用前后取消检查和事务 rollback-only，但不声明能主动中断已经交给 Prisma 执行的查询；在执行查询由数据库 `statement_timeout` 限界。
- 项目 SQL Runner 保持唯一生产 migration history；Prisma Schema/CLI 负责目标模型和候选差异，不直接部署或创建第二套历史表。

## 非目标

- 本 ADR 不新增或修改任何 CRM 业务实体、字段、状态、权限、SLA 或审批路线。
- 本 ADR 不改变 PostgreSQL、模块化单体、应用边界、Outbox/Inbox、Keycloak 或 Flowable 决策。
- 本 ADR 不授权跨模块 Join、共享 Repository 或生成类型作为公共契约。
- 本 ADR 不要求在一个未经验证的提交中完成全部实现迁移。
