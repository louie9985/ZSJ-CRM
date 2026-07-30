# 第一阶段 Walking Skeleton 当前验收证据审计

- 审计日期：2026-07-30
- 审计对象：`docs/06-质量验收/第一阶段Walking-Skeleton验收清单.md` 的 199 个复选项
- 审计性质：仓库证据盘点，不修改权威验收清单，不构成第一阶段签收
- 当前仓库代码证据基线：`2416e63`
- 当前结论：`VERIFIED_REPO 139 / PARTIAL 26 / EXTERNAL_BLOCKED 12 / CONTRACT_BLOCKED 5 / NOT_IMPLEMENTED 17`，合计 199

## 1. 任务边界

已知事实：

- 权威验收清单的 199 项目前均未正式勾选。
- G3 的仓库侧组合、远端 CI 和提交寻址镜像发布证据已存在，但真实首发授权策略、真实 COS、生产 RabbitMQ/TLS/CAM/告警/恢复和消费者显式启用证据未闭合。
- E2E-01 与 OPS-02 未完成。
- Notification、Workflow、File Job 的生产消费者不得在缺少已审合同时创建。
- 远端仓库为 `louie9985/ZSJ-CRM`；基线 `2416e63` 的 CI 与 Application images 工作流均成功，后者已发布按提交寻址的 GHCR 镜像并保留 digest。
- 用户确认项目从未部署，且没有共享测试、预发布或生产数据库；历史 Organization `0000000003` 未进入非临时环境，本地数据库也没有迁移登记记录。
- COS 已开通于 `ap-guangzhou`，但本地开发明确继续使用 Local File Storage + ClamAV；真实 Bucket/CAM conformance 延后，禁止使用主账号 Secret 绕过最小权限。

允许的假设：

- 自动化测试源文件、静态门、版本化迁移、生成器和可执行脚本可证明“仓库中存在可重复验证机制”。
- 已合并 handoff 可用于定位测试和历史 review 记录，但不能替代当前运行输出或真实环境记录。
- 同一组编号仅在状态、证据路径和缺口完全相同时合并表示；编号可回查权威清单中的原文。

禁止的假设：

- 不把 README、目录、接口名、实现代码或历史“通过”文字单独视为运行行为已经验收。
- 不把本地/static/fake 结果冒充 CI、预发布、生产、真实 COS、真实 RabbitMQ、Sentry/云监控或恢复演练证据。
- 不因代码看似存在而推定授权、幂等、故障恢复或敏感数据抽样已经跨组件闭环。
- 不创建 CRM 实体、字段、角色、状态、SLA、审批路线或缺失的生产合同。

非目标：

- 本审计不实现功能、不运行生产环境、不修改合同/代码/原验收清单、不提交 Git。
- 本审计已纳入第 3 节列出的候选分支新鲜专项执行结果，但不替代最终 `pnpm check` 完整输出、Walking Skeleton E2E 报告、预发布报告或恢复报告。

## 2. 状态定义

| 状态 | 含义 |
|---|---|
| `VERIFIED_REPO` | 仓库中存在直接、可重复运行的自动化测试/静态门/生成校验，或该项本身是可由仓库结构确定的否定边界；只代表仓库级证据。 |
| `PARTIAL` | 有实现或局部测试，但缺跨组件闭环、新鲜运行输出、运行时抽样、完整故障路径或全部子条件。 |
| `EXTERNAL_BLOCKED` | 必须由受信 CI、预发布/生产基础设施、真实服务账号、真实 Bucket/监控/主机或恢复演练提供证据。 |
| `CONTRACT_BLOCKED` | 继续实现或验收前缺少已审合同/来源命令边界，按仓库规则必须失败关闭。 |
| `NOT_IMPLEMENTED` | 清单要求的可运行行为或端到端报告当前没有实现。 |

## 3. 当前基线的新鲜执行证据

以下本地结果最初形成于前序候选并已在当前树复核关键门；远端结果直接绑定当前基线 `2416e63`。它们不替代预发布或生产签收证据。

| 范围 | 本次新鲜结果 | 审计影响 |
|---|---|---|
| 本地 Compose | PostgreSQL、Redis、RabbitMQ、Keycloak、Flowable、ClamAV、Nginx 共 7 个服务均为 healthy | `02-05` 从 `PARTIAL` 调整为 `VERIFIED_REPO`；只证明本地 Compose 可启动，不证明 CI/生产部署。 |
| 认证 | 181/181 通过 | 加强第 4 章仓库证据；`04-01` 仍缺 PC Web 浏览器到真实 Keycloak 的签收级 E2E，不升级。 |
| Flowable | 1/1 通过 | 加强第 8 章本地集成证据；不替代 API/Worker 跨组件故障恢复和来源命令合同。 |
| RabbitMQ TLS | 10/10 通过 | 加强第 7 章仓库/本地集成证据；不等于生产 TLS、VHost、CAM、账号轮换或消费者激活证据。 |
| 数据库总门 | 40/40 通过 | 加强迁移、运行角色与隔离 PostgreSQL 的仓库证据。 |
| 模块 PostgreSQL 集成 | Organization 4/4、Notifications 3/3、Authorization 5/5、App Registry 5/5、Audit 3/3、Business Configuration 4/4、Form Schema 3/3、File Center 5/5、Outbox 3/3、Task Center 4/4，全部通过 | 加强第 5～13 章的仓库持久化证据；不补齐真实 COS、缺失消费者合同或主 E2E。 |
| Eventing/Task 后续闭环 | Eventing PostgreSQL 6/6、Task Center PostgreSQL 4/4；10 条 PostgreSQL Runner 的稳定 TCP Readiness 门和 Eventing/Task Cleanup 门 2/2 | `07-07` 与 `09-04` 获得直接仓库级重放/对账证据；测试基础设施不再把裸端口或静默清理失败当作成功。 |
| PC 工作台视觉复验 | 1366x768、1440x900、1920x1080、390x844 四视口；状态恢复；页面 Console warning/error 均为 0 | `14-07～14-08` 获得当前树的直接浏览器证据；不等于真实 BFF/Keycloak 或主 E2E。 |
| 当前候选独立 Review | 既有八维 Review 与 `.handoffs/E2E-01-LOCAL-REVIEW.md` 已记录问题、处置和新鲜测试；本轮预检/清理增量无剩余 P0-P3 | `21-01～21-08` 获得当前仓库代码候选的直接 Review 证据；不覆盖尚未执行的主 E2E、G3 外部证据或 OPS-02。 |
| 远端 CI | [CI run 30512984519](https://github.com/louie9985/ZSJ-CRM/actions/runs/30512984519) 在 `2416e63` 成功，`pnpm check` 步骤成功 | 当前远端仓库已有受信 CI 运行证据；仓库未启用分支保护/审批是用户接受的轻量治理取舍。 |
| 当前 E2E 环境预检 | `pnpm e2e:check` 2/2；`pnpm e2e:preflight` 通过，明确返回 `composeScope=dependencies-only`、`mainWalkingSkeletonReady=false` | 七个依赖服务与五项合同阻塞已机器校验；不升级第 17 章任何主 E2E 项。 |
| 当前本地全仓门 | E2E 预检与 PostgreSQL 匿名卷清理门接入后，`pnpm check` 140/140 Turbo 任务成功 | 证明当前未提交增量通过完整仓库门；仍须推送后取得新远端 CI 证据。 |
| API / Worker | API 176 通过、5 项外部环境测试跳过；Worker 专项通过 | 证明候选版本组合专项通过；5 项 skip 明确保留为外部证据缺口，不能按通过计。 |
| 镜像与部署载荷静态门 | P1 修复后的镜像门 14/14；artifact 卫生器覆盖应用根和部署制品内全部 `@ai-crm` 运行时依赖；deploy 载荷禁止项 0；迁移联合校验通过 | 加强 Dockerfile、应用/Workspace 依赖卫生、部署载荷和迁移制品的仓库门证据。直接证据为 `scripts/deploy/application-artifact-hygiene.mjs`、`sanitize-application-artifact.mjs`、`scripts/check/application-images.test.mjs` 与两个应用 Dockerfile。 |
| 远端镜像构建与发布 | [Application images run 30512984536](https://github.com/louie9985/ZSJ-CRM/actions/runs/30512984536) 在 `2416e63` 完成 API/Worker 精确构建、迁移制品复验、GHCR 登录、按提交寻址发布和 digest 留存 | 已补齐当前基线的受信构建/发布证据；仍不等于预发布/生产拉取、运行或回滚证据。 |

保守结论：Compose 新鲜证据将 `02-05` 升级为 `VERIFIED_REPO`；用户已确认项目从未部署、没有任何非临时数据库且本地无迁移登记，因此 `06-02` 的“已部署迁移不改写”在当前实际环境中无历史对象，结合追加迁移静态门恢复为 `VERIFIED_REPO`。凡是仍缺浏览器全链、真实 Provider、预发布/生产配置、持久恢复报告或已审合同的项目，状态保持不变。

## 4. 分章节统计

| 章节 | 总数 | VERIFIED_REPO | PARTIAL | EXTERNAL_BLOCKED | CONTRACT_BLOCKED | NOT_IMPLEMENTED |
|---|---:|---:|---:|---:|---:|---:|
| 02 环境前置 | 8 | 5 | 3 | 0 | 0 | 0 |
| 03 工程和边界 | 7 | 7 | 0 | 0 | 0 | 0 |
| 04 身份与会话 | 13 | 9 | 4 | 0 | 0 | 0 |
| 05 授权 | 9 | 7 | 2 | 0 | 0 | 0 |
| 06 数据库与迁移 | 8 | 6 | 2 | 0 | 0 | 0 |
| 07 Outbox/RabbitMQ/Inbox | 10 | 9 | 0 | 0 | 1 | 0 |
| 08 Workflow | 8 | 5 | 1 | 0 | 2 | 0 |
| 09 Task Center | 8 | 6 | 1 | 0 | 1 | 0 |
| 10 Notification | 9 | 8 | 0 | 0 | 1 | 0 |
| 11 Audit/App Registry | 8 | 6 | 2 | 0 | 0 | 0 |
| 12 Form/Configuration | 11 | 11 | 0 | 0 | 0 | 0 |
| 13 File Center | 10 | 8 | 1 | 1 | 0 | 0 |
| 14 客户端 | 19 | 19 | 0 | 0 | 0 | 0 |
| 15 Integration Runtime | 8 | 7 | 1 | 0 | 0 | 0 |
| 16 AI Gateway Fake | 8 | 8 | 0 | 0 | 0 | 0 |
| 17 主 E2E | 17 | 0 | 0 | 0 | 0 | 17 |
| 18 可观测与健康 | 10 | 6 | 3 | 1 | 0 | 0 |
| 19 Secret 与主机安全 | 9 | 3 | 2 | 4 | 0 | 0 |
| 20 部署、备份与恢复 | 11 | 1 | 4 | 6 | 0 | 0 |
| 21 独立 Review | 8 | 8 | 0 | 0 | 0 | 0 |
| **合计** | **199** | **139** | **26** | **12** | **5** | **17** |

## 5. 逐项可审计映射

编号格式为 `章节-章节内序号`，例如 `04-03` 对应权威清单第 4 章第三个复选项。

### 02 环境前置检查

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 02-01～02-04 | VERIFIED_REPO | `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`turbo.json`、`scripts/check/verify-runtime.mjs`、`scripts/check/verify-repository.mjs`、`scripts/check/compose-safety.test.mjs` | 已有本轮专项新鲜结果；最终签收仍需保存完整 `pnpm check` 输出。 |
| 02-05 | VERIFIED_REPO | `scripts/check/run-compose-integration.mjs`、`scripts/bootstrap/cleanup-test-compose.mjs`、`deploy/compose/compose.test.yml`；本轮 7 个服务均 healthy | 本地候选版本已实际启动；远程受保护 CI/生产部署仍无执行证据。 |
| 02-06 | PARTIAL | `scripts/check/compose-safety.mjs`、`scripts/check/application-images.test.mjs`、`.env.example` | 还缺实际镜像层、命令行、运行日志的签收抽样。 |
| 02-07 | PARTIAL | `deploy/compose/compose.*.yml`、`deploy/keycloak/realm-dev.json`、`scripts/bootstrap/rabbitmq-integration-fixture.mjs` | 真实存储与各外部环境的隔离记录未提供。 |
| 02-08 | PARTIAL | `packages/observability/src/sentry.test.ts`、客户端 Bundle 检查脚本 | 缺真实测试 Sentry 项目配置与已发布 Source Map 制品抽样。 |

### 03 工程和边界验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 03-01～03-07 | VERIFIED_REPO | `scripts/check/check-boundaries.mjs`、`scripts/check/check-boundaries.test.mjs`、`scripts/check/contracts.test.mjs`、`scripts/contracts/generate.mjs`、`packages/domain-modules/README.md`、`apps/external-portal/src/contract-surface.test.ts`、`apps/api/src/composition.test.ts`、`apps/worker/src/production-composition.test.ts` | 仓库门可验证；最终仍需由受信 CI 固化运行输出。 |

### 04 身份与会话验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 04-01 | PARTIAL | `apps/api/src/auth/keycloak.integration.test.ts`、`apps/workbench-web/src/runtime.ts` | API 登录集成存在，但缺浏览器到真实 Keycloak 的签收级端到端证据。 |
| 04-02～04-03 | VERIFIED_REPO | `apps/api/src/auth/http-adapter.test.ts`、`oidc.test.ts`、`session-security.test.ts` | 仓库级直接测试存在。 |
| 04-04 | PARTIAL | `apps/api/src/auth/session-service.test.ts`、`session-store.integration.test.ts` | 刷新/注销有局部测试；缺真实 IdP 强制失效跨组件证据。 |
| 04-05～04-10 | VERIFIED_REPO | `packages/platform-modules/auth-context/src/verifier.test.ts`、`packages/platform-modules/organization/src/service.test.ts`、`apps/api/src/auth/*.test.ts` | 仓库级正常与拒绝路径测试存在。 |
| 04-11～04-12 | PARTIAL | `packages/observability/src/sanitize.test.ts`、`apps/internal-mobile/src/adapters.test.ts`、`apps/external-portal/src/session-adapters.test.ts` | 缺真实运行日志/Sentry/Trace 抽样；三端 BFF 实际部署隔离未验。 |
| 04-13 | VERIFIED_REPO | `apps/external-portal/src/session-adapters.test.ts`、`portal-shell.test.tsx`、`runtime.production.ts` | 生产骨架失败关闭有直接测试/实现边界。 |

### 05 授权验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 05-01～05-04 | VERIFIED_REPO | `packages/platform-modules/authorization/src/engine.test.ts`、`platform-baseline.test.ts`、`packages/platform-sdk/src/authorization.test.ts` | 仓库级直接测试存在。 |
| 05-05 | PARTIAL | 模块各自 `query-service.test.ts`、`service.test.ts` 与 `postgres-store*.ts` | 尚无统一架构测试证明所有拥有数据模块均正确翻译 Scope。 |
| 05-06～05-08 | VERIFIED_REPO | `authorization/src/redis-cache.test.ts`、`runtime.integration.test.ts`、`apps/api/src/composition-factory.test.ts` | 缓存、任职上下文及拒绝记录有直接测试。 |
| 05-09 | PARTIAL | 各 `platform-http/*.test.ts`、客户端 route-state 测试 | 缺直接 API + 深链 + 重放的全链拒绝 E2E。 |

### 06 数据库与迁移验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 06-01 | VERIFIED_REPO | `packages/database/src/migrations.integration.test.ts` 与本轮数据库 40/40 | 空数据库升级到候选最新版本 `0000000015` 的本地集成证据存在。 |
| 06-02 | VERIFIED_REPO | `migration-compatibility.test.ts`、`migration-artifact.test.mjs` 检测 checksum/identity 漂移；修复以新版本 `0000000015` 追加；用户确认项目从未部署、没有共享测试/预发布/生产数据库且本地无迁移登记 | 当前不存在已部署迁移可被历史改写；首次建立共享环境时仍须从空库执行并保存实际 Manifest/checksum，不能把本结论外推为未来环境证据。 |
| 06-03～06-06 | VERIFIED_REPO | Compose 数据库隔离、模块自有迁移目录/Repository、`migrations*.test.ts`、`runtime-role-*.test.ts`、禁止自动 sync/push 的仓库门 | 数据库隔离、模块边界、受控迁移入口及失败不记成功有自动化机制。 |
| 06-07 | PARTIAL | `packages/platform-modules/organization/migrations/0000000015_recheck_placement_parent_updates.sql` 与 `.meta.json`；用户已确认历史 `0003` 未进入非临时环境 | `0015` 是 destructive trigger replacement：同一事务内 drop/recreate `organization_unit_placements_no_overlap`；元数据已记录 destructive approval、表锁影响、失败事务回滚、恢复和仅允许追加迁移的前滚方案。仍缺首次目标环境的备份/恢复点、变更审批和实际锁影响记录，故不能升级。 |
| 06-08 | PARTIAL | `packages/database/src/runtime*.test.ts`、observability context/trace 测试 | 缺真实慢查询与事务 Trace 关联的运行证据。 |

### 07 Outbox、RabbitMQ 与 Inbox 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 07-01～07-06 | VERIFIED_REPO | `eventing-outbox/src/eventing.test.ts`、`postgres-store.integration.test.ts`、`apps/worker/src/rabbit-adapter.test.ts`、`task-projection-composition.test.ts`、`tests/integration/rabbitmq-tls.mjs` | 仓库/本地集成机制存在；生产 RabbitMQ 另属外部证据。 |
| 07-07 | VERIFIED_REPO | `eventing-outbox/src/operations.ts` 的既有 `replayOutbox` 强制授权、受控原因和审计先于条件重放；单元与 PostgreSQL 集成覆盖允许、拒绝、审计失败、非隔离和缺失记录 | 仓库级操作与失败关闭证据已存在；没有新增通用 HTTP/CLI、DLQ 重放或生产权限 Assignment。 |
| 07-08 | VERIFIED_REPO | Outbox/Inbox PostgreSQL store 与测试不依赖 Redis | 仓库结构和测试可验证事实源边界。 |
| 07-09 | CONTRACT_BLOCKED | `contracts/jobs/README.md`、`apps/worker/src/handler-registry.ts` | 没有获批的具体 Worker Job 合同/权威状态 Owner，不能实现通用重新检查。 |
| 07-10 | VERIFIED_REPO | event envelope schema、`eventing-outbox/src/eventing.test.ts`、worker Rabbit/投影测试 | 消息上下文传播有合同和局部测试。 |

### 08 Workflow 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 08-01～08-04 | VERIFIED_REPO | `deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml`、`workflow/src/bpmn.test.ts`、`flowable-rest.test.ts`、`runtime.integration.test.ts` | 测试资产与中立 Adapter 边界可验证。 |
| 08-05 | CONTRACT_BLOCKED | `workflow/src/service.test.ts`、`contracts/events/workflow-*.schema.json` | 重复完成不产生“领域副作用”需要已审来源命令/Owner，当前不存在。 |
| 08-06 | VERIFIED_REPO | `workflow/src/service.test.ts`、`validation.ts`、`errors.ts` | 状态/错误语义有局部直接测试。 |
| 08-07 | CONTRACT_BLOCKED | workflow 模块保持来源中立 | 缺来源正式命令合同，不能证明完成后命令闭环。 |
| 08-08 | PARTIAL | `workflow/src/flowable-rest.test.ts`、`runtime.integration.test.ts` | 有失败映射/集成测试，但尚无 API/Worker 跨组件恢复报告。 |

### 09 Task Center 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 09-01～09-03 | VERIFIED_REPO | `task-center/src/service.test.ts`、`postgres-store.integration.test.ts`、`apps/worker/src/task-projection-composition.test.ts` | 投影、幂等和乱序测试存在。 |
| 09-04 | VERIFIED_REPO | `task-center` 的授权 `reconcile`、权威 `sourceReader`、同版本漂移修复和旧版本保护均有 Memory/Service/PostgreSQL tests；Worker reconciliation handler 受测；本轮 PostgreSQL 4/4 | 仓库级漂移检测、修复、重复/旧快照与失败关闭证据存在；生产对账运行记录仍属于外部激活证据。 |
| 09-05 | CONTRACT_BLOCKED | Task Center 为只读投影；未发现已审来源完成命令 | 需来源模块合同后才能路由正式完成命令。 |
| 09-06 | VERIFIED_REPO | `contracts/app-registry/deep-link.v1.schema.json`、`task-center/src/contracts.test.ts` | 稳定 App/Route ID 合同受测。 |
| 09-07 | PARTIAL | `apps/api/src/composition-factory.test.ts`、Task HTTP 查询组合 | 有查询授权，缺任务详情深链全链重新授权 E2E。 |
| 09-08 | VERIFIED_REPO | Task 与 Notification 分属独立模块/Schema，相关 service tests | 独立事实边界可由仓库和测试确定。 |

### 10 Notification 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 10-01～10-06 | VERIFIED_REPO | `notifications/src/service.test.ts`、`template.ts`、`contracts.test.ts`、`postgres-store.integration.test.ts`、`apps/workbench-web/src/runtime.ts` 与页面测试 | 幂等、快照、列表状态、模板版本和 PC 轮询有直接证据。 |
| 10-07 | CONTRACT_BLOCKED | `contracts/asyncapi/topology.asyncapi.yaml` 未声明 Notification 消费者 | 缺已审 Notification 异步合同，不能创建 RabbitMQ 重试/DLQ 消费链。 |
| 10-08～10-09 | VERIFIED_REPO | provider-free module/public exports、通知 service tests、边界检查 | 当前无外部渠道 Adapter；送达、已读、任务事实保持分离。 |

### 11 Audit 与 Application Registry 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 11-01 | PARTIAL | `audit/src/service.test.ts`、`postgres-store.integration.test.ts`、API authentication/authorization audit tests | 关键写/授权有审计，但人工重放未实现，敏感访问覆盖未形成全量矩阵。 |
| 11-02～11-07 | VERIFIED_REPO | `contracts/audit/audit-record.v1.schema.json`、audit/App Registry service 与 PostgreSQL tests、external contract-surface tests | 追加式审计、稳定 ID、禁用/外部隔离有直接测试。 |
| 11-08 | PARTIAL | Registry 查询服务与 API authorization tests | 缺所有客户端深链目标的跨端重新授权 E2E。 |

### 12 Form 与 Configuration 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 12-01～12-11 | VERIFIED_REPO | `form-schema/src/service.test.ts`、`authorization-order.test.ts`、`date-format.test.ts`、`business-configuration/src/service.test.ts`、`activation-termination.test.ts`、PostgreSQL integration tests、`tests/fixtures/README.md` | 严格 Schema、限制、发布不可变、版本、事实源和禁止配置边界均有自动化/结构性证据。 |

### 13 File Center 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 13-01 | VERIFIED_REPO | `file-center/src/service.test.ts`、API file HTTP tests | 上传会话和安全返回受测。 |
| 13-02 | PARTIAL | `storage-adapter.conformance.ts`、`local-storage-adapter.test.ts`、`apps/worker/src/cos-storage-adapter.integration.test.ts` | Local 已跑同一门；真实 COS conformance 依赖测试 Bucket，不能等价为已通过。 |
| 13-03～13-09 | VERIFIED_REPO | File Center service/contracts/PostgreSQL tests、ClamAV scanner tests、COS adapter unit tests、客户端 tests | 状态门、隔离、失败关闭、幂等、FileReference 和脱敏输出有仓库级证据。 |
| 13-10 | EXTERNAL_BLOCKED | `apps/worker/src/cos-storage-adapter.integration.test.ts` | 需受审真实测试 Bucket、CAM/Secret、清理与运行记录。 |

### 14 客户端验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 14-01～14-06 | VERIFIED_REPO | `apps/workbench-web/package.json`、App/navigation/styles tests、`scripts/check-bundle.mjs`、generated `packages/api-client` | 技术栈、路由/Query、页面、状态与禁止依赖均可自动验证。 |
| 14-07～14-08 | VERIFIED_REPO | `apps/workbench-web/src/styles.test.ts`、`.handoffs/CURRENT-WORKBENCH-VISUAL-REVIEW.md`；当前树四视口、路由恢复、状态恢复与 Console 抽样通过 | 当前业务中立 Fixture 的可复现浏览器证据存在；不替代真实身份、BFF 或跨组件 E2E。 |
| 14-09～14-19 | VERIFIED_REPO | Workbench bundle gate；Internal Mobile/External Portal build、artifact、adapter、route/session/contract tests | 业务中立性、Taro H5/weapp、隔离 Adapter、allowlist 和秘密排除均有仓库级门。 |

### 15 Integration Runtime 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 15-01 | PARTIAL | `integration-runtime/src/deadline.ts`、`runtime.test.ts` | 总 Deadline/Abort 可测；连接与响应阶段仍由具体 Provider Adapter 实现，当前无真实 Adapter 级证据。 |
| 15-02～15-08 | VERIFIED_REPO | `runtime.test.ts`、`testing.test.ts`、`webhook.test.ts`、public `index.ts`、边界检查 | Retry、非幂等、限流/并发/熔断、原文验签、防重 Fake 和禁止能力有直接测试。 |

### 16 AI Gateway Fake 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 16-01～16-08 | VERIFIED_REPO | `ai-gateway/src/service.test.ts`、`testing.test.ts`、`validation.ts`、`contracts/ai/*.schema.json`、边界检查 | 注册、Schema、合成 Fake、非权威 Proposal、确认重授权/过期、遥测边界和禁止真实 AI 能力受测。 |

### 17 主 Walking Skeleton E2E

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 17-01～17-17 | NOT_IMPLEMENTED | `tests/e2e/environment-preflight.mjs`、`environment-preflight.test.mjs` 与 `CURRENT-ENVIRONMENT-EVIDENCE.md` 仅建立依赖环境预检并显式返回主链未就绪 | Keycloak/BFF → 人员/授权 → Workbench → Form/Flowable → Outbox/RabbitMQ/Worker → Task/Notification → File/ClamAV → 来源命令 → Audit/Trace 全链尚未实现。 |

### 18 可观测与健康验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 18-01 | VERIFIED_REPO | `observability/src/logger.test.ts` | 单行 JSON 日志直接受测。 |
| 18-02 | EXTERNAL_BLOCKED | `deploy/observability/README.md` | 需实际主机日志轮转、磁盘上限和触发证据。 |
| 18-03～18-04 | PARTIAL | observability context/trace/sentry tests、API/worker 局部传播测试 | 缺浏览器到 Worker 全链关联；缺真实 Sentry Release/Environment 事件。 |
| 18-05～18-09 | VERIFIED_REPO | 客户端 artifact gates、`observability/src/health.test.ts`、API/worker health/config tests | Source Map token 排除、liveness/readiness、响应脱敏和 telemetry 降级有仓库级测试。 |
| 18-10 | PARTIAL | `observability/src/sanitize.test.ts`、logger/sentry tests | 清洗逻辑受测；缺真实日志/Sentry 抽样报告。 |

### 19 Secret 与主机安全验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 19-01～19-03 | VERIFIED_REPO | production Compose、`packages/config/src/secret.test.ts`、API/worker production-config tests、compose safety tests | 文件挂载、最小注入和缺失失败关闭有静态/单元证据。 |
| 19-04 | PARTIAL | compose/image/release gates、`.env.example` | 仓库与声明可扫；仍缺受信镜像层、实际命令行和运行环境抽样。 |
| 19-05 | EXTERNAL_BLOCKED | `docs/09-安全与数据治理/Secret与主机安全基线.md` | 需两台真实主机 SSH 配置证据。 |
| 19-06 | PARTIAL | production Compose/Nginx 配置及静态安全门 | 声明中端口边界存在；仍需云防火墙/安全组/主机监听实证。 |
| 19-07 | VERIFIED_REPO | compose safety tests 与 production Compose | 仓库中 Docker Socket 未挂载业务容器。 |
| 19-08～19-09 | EXTERNAL_BLOCKED | 安全基线与 Secret Runbook | 需轮换/撤销/离职/泄露演练和离线私钥存放实证。 |

### 20 部署、备份与恢复验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 20-01 | PARTIAL | `deploy/compose/production/compose.host-a.yml`、`compose.host-b.yml`、README | 两套项目定义存在，尚未在两台主机实际部署。 |
| 20-02 | VERIFIED_REPO | production Compose 与 `docs/01-权威与基线/第一阶段部署范围.md` | API 分布和单点风险在仓库中明确。 |
| 20-03～20-04 | PARTIAL | `deploy/nginx/nginx.production.conf.template`、release/image gates、fixed compose image refs | Nginx/版本静态门存在；缺预发布流量验证与 API/Worker 受信 digest。 |
| 20-05 | EXTERNAL_BLOCKED | 生产发布 Runbook 与 release gates | 需预发布逐台发布、健康检查、回滚记录。 |
| 20-06 | PARTIAL | `scripts/check/verify-worker-drain.mjs`、worker bootstrap tests、production Compose stop grace | 本地 drain 机制可测；缺预发布在途任务/幂等演练。 |
| 20-07～20-11 | EXTERNAL_BLOCKED | `scripts/backup/README.md` 与生产 Runbook | 需故障域外 PostgreSQL/WAL、分库恢复、Rabbit 重建/对账、空主机恢复及实测报告。 |

### 21 独立 Review Pass

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 21-01～21-08 | VERIFIED_REPO | `.handoffs/CURRENT-INDEPENDENT-REVIEW.md` 与 `.handoffs/E2E-01-LOCAL-REVIEW.md` 记录八维问题清单、处置和新鲜测试；本轮增量无剩余 P0-P3 | 只闭合当前仓库代码候选的 Review；G3 外部证据、主 E2E 与 OPS-02 尚未执行，完成后仍须分别独立 Review。 |

## 6. 关键阻断

1. **主 E2E 缺失：17 项。** `tests/e2e` 已有可执行环境预检和边界测试，但业务中立全链与故障/重复/拒绝路径尚未形成可运行测试和报告。
2. **合同阻断：5 项。** 通用 Worker Job、Workflow 来源正式命令、Task 完成路由和 Notification RabbitMQ 消费链不能在合同缺失时实现。
3. **真实外部证据：12 项。** 真实 COS、日志轮转、主机 SSH、Secret 演练、灾备/恢复、预发布发布回滚等必须在受控环境执行。
4. **仓库证据仍非生产签收。** 139 项标为 `VERIFIED_REPO` 只说明存在直接的仓库级可重复验证机制；当前基线已有远端 CI、镜像构建与 GHCR 发布证据，但仍没有预发布/生产运行和最终签收所需的完整证据包。
5. **26 项仅部分闭环。** 主要是跨组件浏览器/E2E、真实运行抽样和预发布接线。历史 Organization `0003` 的外部环境事实已由用户确认不存在，但破坏性迁移的环境级备份/锁影响证据仍待真实部署环境。
6. **真实镜像已构建发布但未部署。** 当前基线 API/Worker 镜像已由远端工作流构建、复验并发布 GHCR；尚无预发布/生产拉取、non-root 运行抽样、健康、逐台发布与回滚证据。

## 7. 建议的证据闭环顺序

1. 保存本轮 Compose、认证、数据库、RabbitMQ TLS、Flowable、模块、API/Worker、镜像静态门与迁移联合校验的命令、版本、退出码和日志摘要，并补跑/保存最终非缓存 `pnpm check` 完整输出。
2. 保留“历史 Organization `0000000003` 未进入任何非临时环境、本地无迁移登记”的用户确认；首次建立共享环境时从空库执行并保存迁移 Manifest、checksum、备份/恢复点和锁影响证据。
3. 在首个测试服/预发布环境验证已发布 API/Worker digest 的拉取、non-root 运行、迁移 Manifest、Fixture/Source Map/Secret 排除、健康和回滚。
4. 在合同 Owner 决策前维持 5 个 `CONTRACT_BLOCKED` 项失败关闭，不以通用消费者代替具体合同。
5. 外部 G3 闭合后实现 E2E-01，再执行 OPS-02 和当前候选版本的八维独立 Review。
6. 只有证据文件经过复核后，才由验收 Owner 在权威清单逐项勾选；不得根据本审计批量勾选。

## 8. 审计自检

- 编号计数：20 个章节，199 项；五类状态为 139/26/12/5/17，合计 199。
- 证据基线：已注明当前仓库代码证据基线 `2416e63`；5 项 API external skip、未部署环境和 E2E 预检的 `mainWalkingSkeletonReady=false` 未被计为通过。
- 原验收清单与合同：未修改。
- 当前代码增量、视觉复验和独立 Review handoff 均已在本审计中列出直接证据。
- `output/`：未读取、未修改。
- 生产/外部系统：未访问。
- 本文件未写入 Secret、个人数据、真实 Provider Payload 或生产标识。
