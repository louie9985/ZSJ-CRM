# 全项目 Prisma 重构方案与执行计划

- 状态：实现迁移已完成；真实 PostgreSQL 迁移/漂移集成证据待具备 Docker 或测试数据库的环境补齐
- 日期：2026-07-31
- Owner：项目负责人；技术执行 Owner 待分配
- 适用范围：`packages/database`、所有 PostgreSQL 持久化模块、迁移工具、CI/构建、部署与相关文档
- 架构依据：ADR-0028；ADR-0011 中未被替代的 PostgreSQL、模块所有权、事务与迁移治理约束

## 1. 目标

把全项目持久化实现从 Drizzle/通用 SQL Runtime 迁移到 Prisma，使 Prisma 成为默认且唯一的 ORM、Schema 和 Client 生成技术，同时保持以下既有行为不变：

- PostgreSQL Schema 与 Repository 按模块所有。
- 公共契约不暴露 ORM 或数据库供应商类型。
- 本地状态与 Outbox、消费状态与 Inbox 的原子事务。
- 已执行迁移不可修改，生产迁移独立部署、使用专用 DDL 凭据并全局互斥。
- 授权、审计、幂等、并发约束、失败关闭、可观测性和回滚/前滚能力。

## 2. 已知事实

- 根依赖包含 `drizzle-kit@0.31.4`；七个包直接依赖 `drizzle-orm@0.45.2`。
- `packages/database/src/runtime.ts` 初始化 Drizzle，但共享运行时和多数 Repository 实际通过 `pg` 参数化 SQL 工作。
- 六个模块有 Drizzle Schema 源码：`app-registry`、`audit`、`business-configuration`、`file-center`、`form-schema`、`organization`。
- 十个模块已有 PostgreSQL 持久化 Adapter：上述六个模块，以及 `authorization`、`eventing-outbox`、`notifications`、`task-center`。
- 仓库有十五份全局编号 SQL migration 和对应元数据，覆盖 `0000000001`～`0000000015`；这些历史文件必须保持不可变。
- Outbox 抢占使用 `FOR UPDATE SKIP LOCKED`，多个模块使用 Advisory Lock、触发器、检查约束、复合外键、角色授权等 PostgreSQL 特性，不能假设 Prisma Schema 能完整表达。
- 当前公共 Runtime 支持嵌套事务语义和 `AbortSignal` 取消；Prisma 替换实现必须先证明行为等价或明确批准差异。

## 3. 允许的假设

- 具体 Prisma 版本可在兼容性试验后锁定，不在计划阶段猜测版本号。
- 可以建立模块 Schema 源片段和确定性组合产物；生成产物可以不提交，但 CI 必须验证可重复生成。
- 模块迁移可并行实施，但共享 Prisma 基础设施、Schema 组合根和迁移链只能由一个 Owner 串行合并。
- 受控、参数化 Raw SQL 是 Prisma 实现的一部分，适用于 Prisma Client 无法安全表达的 PostgreSQL 能力。

## 4. 禁止的假设

- 不把现有 Drizzle Schema 当作完整数据库事实；必须同时核对历史 migration 和真实 PostgreSQL introspection。
- 不通过双写、改表、重放业务事件或清空数据库来比较 ORM 行为。
- 不允许模块直接依赖根 Prisma Client 并任意访问其他模块模型。
- 不将 Prisma 生成模型直接作为领域模型、DTO、OpenAPI 或事件类型。
- 不在迁移过程中顺便重命名表/列、改变 ID、时间、JSON、枚举、空值或删除语义。
- 不使用 `prisma db push` 更新任何共享环境。
- 不在未验证连接池、事务和迁移行为前删除现有 `pg` Runtime 或历史迁移执行器。

## 5. 非目标

- 不新增 CRM 领域模块或业务表。
- 不改变 PostgreSQL、部署拓扑、数据库角色、备份策略、Keycloak 或 Flowable 数据库。
- 不优化或重写与 ORM 切换无关的业务逻辑。
- 不承诺日历工期；执行以验收门和证据推进。

## 6. 目标结构

```text
模块私有 Prisma Schema 源片段
        ↓ 确定性组合/校验
部署 Prisma Schema ──→ Prisma Client 生成
        ↓                         ↓
经评审的 migration SQL      模块私有 Repository/Mapper
        ↓                         ↓
独立迁移进程              供应商中立模块公共接口
```

建议目录由 ORM-01 试点确认后固化：

```text
packages/database/
  prisma/base.prisma
  src/prisma-runtime.ts
  src/transaction-context.ts
  generated/                 # 生成位置与是否入库待试点决定
packages/platform-modules/<module>/
  prisma/<module>.prisma     # 模块拥有
  src/infrastructure/prisma-*.ts
prisma/
  schema.prisma              # 确定性生成，不作为手工事实源
  migrations/<timestamp>_*/migration.sql
scripts/prisma/
  compose-schema.mjs
  verify-boundaries.mjs
  verify-drift.mjs
```

目录名不是先验合同；ORM-01 必须用最小试点验证 Prisma CLI、pnpm、Turbo 和镜像构建后再固定。

## 7. 文件与改造面

| 改造面 | 当前状态 | 目标状态 | 主要风险 |
|---|---|---|---|
| 根依赖与锁文件 | `drizzle-kit`，无直接 Prisma 基线 | 锁定 Prisma CLI/Client，最终无 Drizzle | Node 24、生成与安装兼容 |
| `packages/database` | `pg` Runtime 中初始化 Drizzle，自研事务/取消 | Prisma 生命周期与私有事务上下文，公共边界供应商中立 | 嵌套事务、取消、连接占用 |
| 六份 `src/schema.ts` | Drizzle Schema | 模块 Prisma Schema 源片段 | Check/trigger/partial index 表达差异 |
| 十个 PostgreSQL Adapter | 大量 `$1` 参数 SQL | Prisma CRUD/查询；复杂能力使用参数化 Raw Query | 行为、错误码、性能回归 |
| 十五份历史 migration | 自研全局 SQL 链和元数据 | 原样保留，并与 Prisma 新迁移连续执行 | history/baseline 漂移 |
| 构建与 CI | 无 Prisma generate/drift gate | 组合、format/validate、generate、边界与 drift 检查 | 并行编辑冲突、缓存不一致 |
| 部署 | `pnpm db:migrate` 执行历史链 | 独立、互斥、可审计的连续迁移入口 | 并发部署、失败恢复 |
| 文档与检查 | Drizzle 口径 | Prisma 口径，历史文件明确标记 | 文档领先于实现 |

## 8. 工作包与依赖

### ORM-00：基线冻结与证据采集

Owner 修改范围：测试资产、迁移清单、重构 handoff，不修改运行实现。

产出：

- 记录十五份 migration Checksum、空库最终 Schema 摘要和真实数据库 introspection 快照。
- 为十个持久化模块列出表、视图、索引、约束、触发器、角色授权及 SQL 特性。
- 固化当前 `pnpm check`、数据库集成测试、Outbox/Inbox 并发测试和查询基准结果。
- 建立 Drizzle 临时允许清单；新文件禁止引入 Drizzle。

验收门 G-ORM-0：当前行为和数据库结构可重复，所有未解析差异进入 handoff，不静默编码。

### ORM-01：Prisma 技术 Spike 与版本锁定

前置：G-ORM-0。

产出：

- 验证 Node 24、pnpm、Turbo、TypeScript ESM、Docker 构建和目标 PostgreSQL。
- 在原生多文件 Schema 与自研确定性组合器之间做出记录化选择。
- 验证 PostgreSQL 多 Schema 映射、JSON、复合键、映射名、Raw Query、错误码和 Client 生成。
- 验证交互式事务、嵌套调用策略、超时、取消、连接池与进程关闭。
- 锁定 Prisma 相关版本并形成升级/回退说明。

验收门 G-ORM-1：最小试点在真实 PostgreSQL 通过，ADR-0028 待确认事项全部关闭或形成新的 ADR。

### ORM-02：Schema 组合、Client 与边界检查

前置：G-ORM-1。该工作包独占共享 Prisma 组合根。

产出：

- 模块 Schema 片段协议、确定性组合工具、Prisma Client 生成和 Turbo 缓存配置。
- `packages/database` Prisma Runtime、健康检查、错误映射和私有事务上下文。
- CI 检查：禁止跨模块 Prisma 导入、禁止公共导出 Prisma 类型、禁止新 Drizzle、禁止不安全 Raw API。
- 测试：生成可重复、缺失/重复模型失败、跨模块 relation 失败、Secret 缺失失败关闭。

验收门 G-ORM-2：基础设施 API 冻结；后续模块只消费已评审的内部 Adapter 接口。

### ORM-03：低并发模块迁移

前置：G-ORM-2。可按模块分支并行，Schema 组合根由 ORM-02 Owner 合并。

模块：`app-registry`、`audit`、`business-configuration`、`file-center`、`notifications`。

每个模块产出：

- Prisma Schema 片段、Repository/Mapper、错误映射和真实 PostgreSQL 集成测试。
- 原迁移 SQL 中 Prisma 无法表达对象的差异清单。
- 授权、审计、幂等、不可变记录、分页/排序和查询计划证据。
- 切换与应用回退说明；不做双写。

验收门 G-ORM-3：五个模块逐一通过行为对照，删除各自 Drizzle Schema/依赖或从临时允许清单移除。

### ORM-04：事务与并发关键模块迁移

前置：G-ORM-2；建议在 G-ORM-3 稳定后合并。

模块与重点：

- `organization`：有效期重叠、触发器、复合外键和并发序列化。
- `form-schema`：发布不可变、Advisory Lock、版本并发和 JSON 校验边界。
- `authorization`：不可变发布、当前指针、决策追加和幂等冲突。
- `task-center`：版本单调、乱序/重复事件和投影更新。
- `eventing-outbox`：Outbox/Inbox 原子性、`SKIP LOCKED`、Claim Token、重试与隔离。

验收门 G-ORM-4：真实 PostgreSQL 并发、回滚、超时、死锁/冲突、重复投递和故障恢复全部通过；任何语义差异均有明确批准。

### ORM-05：迁移链与部署切换

前置：G-ORM-3、G-ORM-4。

产出：

- 保留 `0000000001`～`0000000015` 原文件和 Checksum，建立明确的 Prisma 切换点。
- 决定并实现单一部署入口：先验证/执行历史链，再执行 Prisma 新迁移；或由兼容执行器统一调度两类受评审 SQL。
- 空库重建、现有基线升级、并发迁移互斥、失败不记成功、破坏性迁移阻断、应用回滚/前滚修复测试。
- 更新 Compose、部署制品校验、运行角色权限和运维手册。

验收门 G-ORM-5：预发布数据库演练通过，历史迁移和 Prisma 新迁移只有一个权威部署入口。

### ORM-06：清理与关闭（已完成）

前置：G-ORM-5。

产出：

- 删除所有非历史 Drizzle Schema、导入、包依赖、根 `drizzle-kit` 和锁文件条目。
- 删除临时兼容代码与允许清单；仓库检查改为 Drizzle 零容忍。
- 更新模块 README、验收证据和依赖升级说明。
- 运行 `pnpm check`、全部数据库集成测试和 Walking Skeleton E2E。

验收门 G-ORM-6：除已标记的历史 ADR/迁移说明外，全仓无 Drizzle 运行依赖或实现引用；Prisma 成为唯一 ORM，ADR-0028 验收条件全部满足。

当前结果：10 个模块私有 Schema 片段已组合为 47 个模型、11 个 PostgreSQL Schema；Prisma `7.9.1` Client、默认 Runtime、错误归一、事务 rollback-only、边界检查和生成门禁已实现；根和模块 Drizzle 依赖、六份 Drizzle Schema 源码已移除。由于当前执行环境没有 Docker 和测试数据库连接，G-ORM-0/5 中依赖真实 PostgreSQL 的空库重建、结构 drift、并发锁与执行计划证据仍须在可用环境补齐，不能据此声称数据库级验收完成。

## 9. 推荐执行顺序

```text
ORM-00 → ORM-01 → ORM-02
                    ├─→ ORM-03 ─┐
                    └─→ ORM-04 ─┴→ ORM-05 → ORM-06
```

ORM-03 的模块可以并行；ORM-04 也可按模块并行开发，但 `packages/database`、根 Prisma Schema 组合、迁移编号和部署入口始终单 Owner 串行合并。

## 10. 每模块完成标准

- Prisma Schema 与历史 SQL/真实数据库一致，差异已解释。
- Repository 不暴露 Prisma 类型，不读取其他模块表。
- 普通 CRUD 优先使用 Prisma；Raw SQL 仅限记录过的 PostgreSQL 特性并参数化。
- 单元和真实 PostgreSQL 集成测试覆盖正常、拒绝、重复、并发、回滚和故障路径。
- 授权、审计和幂等行为没有变化。
- 列表查询有界分页和稳定排序；关键查询执行计划无不可接受回归。
- 日志、Sentry、Trace 和指标不包含 SQL 参数、个人数据、业务载荷或 Prisma 错误原文中的敏感内容。
- 有应用回退或前滚修复说明；无需回写或回滚数据库历史。
- 包级构建、Lint、Typecheck、Test、Contract Check 和全仓 `pnpm check` 通过。

## 11. 独立 Review Pass

每个工作包合并前由非实现者检查：

- 授权与数据范围是否仍由资源拥有模块执行。
- 幂等键、唯一冲突和重放是否保持原语义。
- Prisma 事务是否覆盖全部本地写与 Outbox/Inbox 事实，是否错误包含远程调用。
- migration 是否追加、可审查、与旧应用兼容，并有恢复/前滚指导。
- Raw Query 是否参数化，动态标识符是否封闭，查询是否有界。
- 日志、指标、Trace、Sentry 和健康响应是否泄露数据。
- 模块公共入口、生成物和测试是否形成 Prisma 或跨模块耦合。
- API、事件、Job 和数据库结构是否保持向后兼容。

## 12. 停止与回退条件

出现以下任一情况时停止该模块或共享基线切换：

- 无法从历史迁移连续重建，或 Prisma introspection 与真实 Schema 存在未解释差异。
- Outbox/Inbox、不可变发布、有效期约束或版本单调性出现行为差异。
- Prisma 事务导致连接耗尽、超时/取消失效或远程调用进入长事务。
- 关键查询执行计划显著退化且没有受审 Raw Query 方案。
- 公共 API 暴露 Prisma 类型，或出现跨模块数据访问。

回退优先恢复上一版应用 Adapter；不修改已执行迁移、不清库、不执行破坏性 Down Migration。数据库若已有追加变更，遵循该 migration 的兼容窗口和前滚修复指导。

## 13. 未解决事项与责任

| 事项 | 关闭工作包 | 未关闭前限制 |
|---|---|---|
| Prisma 版本与 Node 24/镜像兼容 | ORM-01 | 不提交生产依赖锁定 |
| 多文件 Schema 或确定性组合器 | ORM-01 | 不并行创建模块片段 |
| Client 生成位置与打包 | ORM-02 | 不修改应用镜像入口 |
| 嵌套事务、取消和连接池语义 | ORM-01/02 | 不切换 `packages/database` |
| 历史 migration 与 Prisma history 衔接 | ORM-05 | 不替换生产迁移入口 |
| Raw SQL 允许清单和性能阈值 | ORM-00/04 | 复杂模块不得完成验收 |
