# 第一阶段 Walking Skeleton 当前验收证据审计

- 审计日期：2026-08-02
- 审计对象：`docs/06-质量验收/第一阶段Walking-Skeleton验收清单.md` 当前实际存在的 201 个复选项
- 审计性质：仓库证据盘点，不修改权威验收清单，不构成第一阶段签收
- 当前仓库代码证据基线：`a7c3e90`
- 当前结论：`VERIFIED_REPO 166 / PARTIAL 24 / EXTERNAL_BLOCKED 11 / CONTRACT_BLOCKED 0 / NOT_IMPLEMENTED 0`，合计 201

## 1. 任务边界

已知事实：

- 权威验收清单当前包含 201 项；第 17 节已按 2026-08-02 的本地业务中立组合证据勾选 17/17，其余章节仍按仓库证据与外部证据边界保守统计。旧审计的“199 项”口径漏计了 `010ffa4` 加入第 6 章的两项 Prisma 迁移验收要求。
- G3 的仓库侧组合、远端 CI 和提交寻址镜像发布证据已存在，但真实首发授权策略、真实 COS、生产 RabbitMQ/TLS/CAM/告警/恢复和消费者显式启用证据未闭合。
- E2E-01 的本地业务中立组合证据已执行；第 17 节 17/17 已闭合，包括 Workbench Registry/Deep Link、Form UI 同链提交、稳定 FileReference、Task/Notification 耐久观察及浏览器到 Worker/Audit 的 Trace。OPS-02 仍只有仓库级 Manifest/失败关闭校验，没有任何真实备份、WAL、Secret 应急包或恢复演练证据。
- Walking Skeleton 的测试专用来源命令、Notification Job、AsyncAPI 拓扑和处理器合同已经存在；它们只解除测试验收的合同阻断，不授权生产 Notification、Workflow 或 File Job 消费者。
- 远端仓库为 `louie9985/ZSJ-CRM`；基线 `9fa4e2c` 的 CI 与 Application images 工作流均成功，后者已发布按提交寻址的 GHCR 镜像并保留 digest。
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
- 本审计纳入第 3 节列出的当前提交专项执行结果及已保存的最终 `pnpm check` 摘要，但不替代预发布报告、真实日志/Sentry 抽样或恢复报告。

## 2. 状态定义

| 状态 | 含义 |
|---|---|
| `VERIFIED_REPO` | 仓库中存在直接、可重复运行的自动化测试/静态门/生成校验，或该项本身是可由仓库结构确定的否定边界；只代表仓库级证据。 |
| `PARTIAL` | 有实现或局部测试，但缺跨组件闭环、新鲜运行输出、运行时抽样、完整故障路径或全部子条件。 |
| `EXTERNAL_BLOCKED` | 必须由受信 CI、预发布/生产基础设施、真实服务账号、真实 Bucket/监控/主机或恢复演练提供证据。 |
| `CONTRACT_BLOCKED` | 继续实现或验收前缺少已审合同/来源命令边界，按仓库规则必须失败关闭。 |
| `NOT_IMPLEMENTED` | 清单要求的可运行行为或端到端报告当前没有实现。 |

## 3. 当前基线的新鲜执行证据

以下本地结果最初形成于前序候选并已在当前树复核关键门；已列出的最新远端结果绑定基线 `9fa4e2c`。它们不替代预发布或生产签收证据。

| 范围 | 本次新鲜结果 | 审计影响 |
|---|---|---|
| 本地 Compose | PostgreSQL、Redis、RabbitMQ、Keycloak、Flowable、ClamAV、Nginx 共 7 个服务均为 healthy | `02-05` 从 `PARTIAL` 调整为 `VERIFIED_REPO`；只证明本地 Compose 可启动，不证明 CI/生产部署。 |
| 认证与浏览器 BFF | `pnpm auth:test:integration` 181/181；`pnpm e2e:browser-auth:integration` 通过 | 真实 Chromium 经 Workbench/Nginx/BFF 到 Keycloak，验证 Authorization Code + PKCE、HttpOnly/Secure/SameSite Cookie、刷新轮换、注销相关会话行为、CSRF、Fixation、伪造回调和过期 Session；`04-01`、`17-01` 升级。 |
| Flowable | 1/1 通过 | 加强第 8 章本地集成证据；不替代 API/Worker 跨组件故障恢复和来源命令合同。 |
| RabbitMQ TLS | 10/10 通过 | 加强第 7 章仓库/本地集成证据；不等于生产 TLS、VHost、CAM、账号轮换或消费者激活证据。 |
| 数据库总门 | 40/40 通过 | 加强迁移、运行角色与隔离 PostgreSQL 的仓库证据。 |
| 模块 PostgreSQL 集成 | Organization 4/4、Notifications 3/3、Authorization 5/5、App Registry 5/5、Audit 3/3、Business Configuration 4/4、Form Schema 3/3、File Center 5/5、Outbox 3/3、Task Center 4/4，全部通过 | 加强第 5～13 章的仓库持久化证据；不补齐真实 COS、缺失消费者合同或主 E2E。 |
| Eventing/Task 后续闭环 | Eventing PostgreSQL 6/6、Task Center PostgreSQL 4/4；10 条 PostgreSQL Runner 的稳定 TCP Readiness 门和 Eventing/Task Cleanup 门 2/2 | `07-07` 与 `09-04` 获得直接仓库级重放/对账证据；测试基础设施不再把裸端口或静默清理失败当作成功。 |
| PC 工作台视觉复验 | 1366x768、1440x900、1920x1080、390x844 四视口；状态恢复；页面 Console warning/error 均为 0 | `14-07～14-08` 获得当前树的直接浏览器证据；不等于真实 BFF/Keycloak 或主 E2E。 |
| 当前候选独立 Review | `.handoffs/CURRENT-G5-INDEPENDENT-REVIEW.md` 记录本轮文档、Authorization、HTTP replay 和 Task workforce 错误映射 findings、修复、八维结论及独立容器复跑；没有开放 P0-P3 | `21-01～21-08` 保持仓库级直接 Review 证据；不覆盖 OPS-01/OPS-02 的真实环境执行，后续外部报告仍须独立 Review。 |
| 远端 CI | [CI run 30519665799](https://github.com/louie9985/ZSJ-CRM/actions/runs/30519665799) 在 `9fa4e2c` 成功，`pnpm check` 步骤成功 | 当前远端仓库已有受信 CI 运行证据；仓库未启用分支保护/审批是用户接受的轻量治理取舍。 |
| 当前 E2E 环境预检 | `node tests/e2e/environment-preflight.mjs` 通过；`environment-preflight.test.mjs` 5/5 | 返回 `composeScope=full-process-skeleton`、`contractBlockers=[]`、`implementationGaps=[]`、`mainWalkingSkeletonReady=false`，并对证据连接漂移和隔离 Worker 漂移失败关闭。静态预检不执行 combined gate，因此不能提升 readiness。 |
| 业务中立平台与进程组合 | E2E package 75/75；`pnpm e2e:compose:integration` 通过 10 服务组合 | 公共入口覆盖 Organization、Registry/Deep Link、Form、Task、Notification、Audit；隔离 Worker 通过 TLS RabbitMQ + PostgreSQL 安装真实 Task Projection Consumer。提交 `a7c3e90` 已将 Workbench 注册加载、Form 同链提交和 Task/Notification 耐久轮询合并进真实浏览器执行，17-03、17-08、17-09、17-17 均闭合。 |
| 浏览器到 Worker 组合证据 | 当前树 `pnpm e2e:combined-evidence:integration` 返回 `e2e-browser-to-worker-causal-evidence-passed` | 真实浏览器登录后的 BFF Session/CSRF Task POST 经 Organization/Authorization 允许或失败关闭，三类 workforce/permission 拒绝返回 403，同一成功 HTTP 请求重放一致；真实 ClamAV `available` FileReference、PostgreSQL Form/Task/Workflow Ledger、真实 Flowable、TLS RabbitMQ、Worker、Outbox/Inbox、来源重授权、Notification 和 30 条 Audit 使用同一 Trace/FileReference；关闭 `17-02`、`17-16` 及其已执行的中间步骤。 |
| 拒绝、过期、依赖故障与恢复 | 浏览器链拒绝错误 CSRF、旧/过期 Cookie、伪造回调；耐久主链拒绝无权限主体和 inactive Form release，并验证依赖失败后同幂等键重试/恢复、重复命令/消息无重复副作用 | `17-14～17-15` 获得组合证据；仍不把测试注入的失败称作真实生产依赖故障演练。 |
| OPS-02 仓库级恢复证据门 | `scripts/backup/recovery-evidence.mjs`、CLI、合成示例和 `scripts/check/backup-recovery.test.mjs` 要求三库分别恢复、WAL 连续性、异故障域加密备份、RabbitMQ/Outbox/Inbox/业务状态对账、配置制品、加密 Secret 应急包、隔离空主机恢复和安全演练均绑定 `evidence://` 与 SHA-256，并拒绝自报布尔、敏感字段和未批准的 RPO/RTO/SLA/保留期/频率/Owner | 只证明仓库证据结构会失败关闭；校验器不解析证据、不重算底层制品摘要，也未访问 PostgreSQL、RabbitMQ、`age`、COS 或服务器。`19-08～19-09`、`20-07～20-11` 状态均不升级。 |
| 本地全仓门 | 当前树 `pnpm check` 133/133；Authorization Redis 集成使用受支持的 `AI_CRM_AUTHORIZATION_REDIS_PASSWORD_FILE` 指向运行中 dev Redis 的 Secret 文件 | 当前树完整仓库门通过，Secret 值未进入命令、日志或证据；最终提交后仍须由受信 CI 保存提交寻址输出。 |
| API / Worker | API 193 通过、5 项外部环境测试跳过；Worker 118 通过、5 项跳过；E2E 75/75；Workbench 34/34 | 证明候选版本组合专项通过；skip 仍是外部环境缺口，不能按通过计。 |
| 镜像与部署载荷静态门 | P1 修复后的镜像门 14/14；artifact 卫生器覆盖应用根和部署制品内全部 `@ai-crm` 运行时依赖；deploy 载荷禁止项 0；迁移联合校验通过 | 加强 Dockerfile、应用/Workspace 依赖卫生、部署载荷和迁移制品的仓库门证据。直接证据为 `scripts/deploy/application-artifact-hygiene.mjs`、`sanitize-application-artifact.mjs`、`scripts/check/application-images.test.mjs` 与两个应用 Dockerfile。 |
| 远端镜像构建与发布 | [Application images run 30519665813](https://github.com/louie9985/ZSJ-CRM/actions/runs/30519665813) 在 `9fa4e2c` 完成 API/Worker 精确构建、迁移制品复验、GHCR 登录、按提交寻址发布和 digest 留存 | 已补齐远端基线的受信构建/发布证据；仍不等于预发布/生产拉取、运行或回滚证据。 |

保守结论：本地 Walking Skeleton 第 17 节 17/17 已闭合，五个旧合同阻断由测试专用已审合同解除，`NOT_IMPLEMENTED` 归零，G4 为 `PASSED_LOCAL`。`mainWalkingSkeletonReady=true` 不等于 G5 或生产签收：日志/Sentry 仍缺真实抽样，真实 COS、主机、预发布发布/回滚及恢复演练状态均不升级。

## 4. 分章节统计

| 章节 | 总数 | VERIFIED_REPO | PARTIAL | EXTERNAL_BLOCKED | CONTRACT_BLOCKED | NOT_IMPLEMENTED |
|---|---:|---:|---:|---:|---:|---:|
| 02 环境前置 | 8 | 5 | 3 | 0 | 0 | 0 |
| 03 工程和边界 | 7 | 7 | 0 | 0 | 0 | 0 |
| 04 身份与会话 | 13 | 10 | 3 | 0 | 0 | 0 |
| 05 授权 | 9 | 7 | 2 | 0 | 0 | 0 |
| 06 数据库与迁移 | 10 | 8 | 2 | 0 | 0 | 0 |
| 07 Outbox/RabbitMQ/Inbox | 10 | 10 | 0 | 0 | 0 | 0 |
| 08 Workflow | 8 | 7 | 1 | 0 | 0 | 0 |
| 09 Task Center | 8 | 7 | 1 | 0 | 0 | 0 |
| 10 Notification | 9 | 9 | 0 | 0 | 0 | 0 |
| 11 Audit/App Registry | 8 | 6 | 2 | 0 | 0 | 0 |
| 12 Form/Configuration | 11 | 11 | 0 | 0 | 0 | 0 |
| 13 File Center | 10 | 8 | 1 | 1 | 0 | 0 |
| 14 客户端 | 19 | 19 | 0 | 0 | 0 | 0 |
| 15 Integration Runtime | 8 | 7 | 1 | 0 | 0 | 0 |
| 16 AI Gateway Fake | 8 | 8 | 0 | 0 | 0 | 0 |
| 17 主 E2E | 17 | 17 | 0 | 0 | 0 | 0 |
| 18 可观测与健康 | 10 | 7 | 2 | 1 | 0 | 0 |
| 19 Secret 与主机安全 | 9 | 4 | 2 | 3 | 0 | 0 |
| 20 部署、备份与恢复 | 11 | 1 | 4 | 6 | 0 | 0 |
| 21 独立 Review | 8 | 8 | 0 | 0 | 0 | 0 |
| **合计** | **201** | **166** | **24** | **11** | **0** | **0** |

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
| 04-01 | VERIFIED_REPO | `scripts/check/run-e2e-browser-authentication.mjs`、`tests/e2e/CURRENT-ENVIRONMENT-EVIDENCE.md` | 真实 Chromium 已经 Workbench/Nginx/BFF 进入真实 Keycloak 登录页并完成合成用户登录；只证明隔离本地 E2E，不代表生产 IdP。 |
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
| 06-03～06-08 | VERIFIED_REPO | Compose 数据库隔离、模块自有 Schema/Repository、`prisma-generation.test.mjs`、`migration-compatibility.test.ts`、`migrations*.test.ts`、`runtime-role-*.test.ts` 与禁止自动 sync/push 的仓库门 | 当前权威清单此处实际包含六项：三库隔离、模块所有权、禁止自动同步、Prisma 源片段确定性组合、历史 SQL/Prisma 连续重建、迁移失败不记成功；均有自动化机制。旧审计漏计中间两项并错误压缩为四项。 |
| 06-09 | PARTIAL | `packages/platform-modules/organization/migrations/0000000015_recheck_placement_parent_updates.sql` 与 `.meta.json`；用户已确认历史 `0003` 未进入非临时环境 | `0015` 是 destructive trigger replacement；元数据记录锁影响、事务回滚、恢复和仅追加前滚方案，仍缺目标环境备份/恢复点、变更审批和实际锁影响记录。 |
| 06-10 | PARTIAL | `packages/database/src/runtime*.test.ts`、observability context/trace tests | 缺真实慢查询与事务 Trace 关联的运行证据。 |

### 07 Outbox、RabbitMQ 与 Inbox 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 07-01～07-06 | VERIFIED_REPO | `eventing-outbox/src/eventing.test.ts`、`postgres-store.integration.test.ts`、`apps/worker/src/rabbit-adapter.test.ts`、`task-projection-composition.test.ts`、`tests/integration/rabbitmq-tls.mjs` | 仓库/本地集成机制存在；生产 RabbitMQ 另属外部证据。 |
| 07-07 | VERIFIED_REPO | `eventing-outbox/src/operations.ts` 的既有 `replayOutbox` 强制授权、受控原因和审计先于条件重放；单元与 PostgreSQL 集成覆盖允许、拒绝、审计失败、非隔离和缺失记录 | 仓库级操作与失败关闭证据已存在；没有新增通用 HTTP/CLI、DLQ 重放或生产权限 Assignment。 |
| 07-08 | VERIFIED_REPO | Outbox/Inbox PostgreSQL store 与测试不依赖 Redis | 仓库结构和测试可验证事实源边界。 |
| 07-09 | VERIFIED_REPO | `contracts/jobs/walking-skeleton-source-command.v1.schema.json`、`contracts/asyncapi/walking-skeleton.asyncapi.yaml`、`tests/e2e/src/walking-skeleton-source-handler.ts` 及测试 | 测试专用 Job 在执行前调用 `recheckAuthoritativeState`/`canAccept`，并在真实 RabbitMQ Worker 链执行；不授权任何通用或生产 Job。 |
| 07-10 | VERIFIED_REPO | event envelope schema、`eventing-outbox/src/eventing.test.ts`、worker Rabbit/投影测试 | 消息上下文传播有合同和局部测试。 |

### 08 Workflow 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 08-01～08-04 | VERIFIED_REPO | `deploy/flowable/bpmn/synthetic-human-task.v1.bpmn20.xml`、`workflow/src/bpmn.test.ts`、`flowable-rest.test.ts`、`runtime.integration.test.ts` | 测试资产与中立 Adapter 边界可验证。 |
| 08-05 | VERIFIED_REPO | `contracts/jobs/walking-skeleton-source-command.v1.schema.json`、`tests/e2e/src/main-chain.ts`、Workflow/service tests | 测试来源正式命令和幂等边界已审；同一 Task 命令重放只产生一次 Flowable/来源副作用。仅适用于 Walking Skeleton 测试来源。 |
| 08-06 | VERIFIED_REPO | `workflow/src/service.test.ts`、`validation.ts`、`errors.ts` | 状态/错误语义有局部直接测试。 |
| 08-07 | VERIFIED_REPO | Walking Skeleton Job/AsyncAPI 合同、`walking-skeleton-workflow.ts`、`walking-skeleton-source-handler.ts`、组合 E2E | Flowable 完成经正式测试命令请求测试来源，来源处理器保持独立并重新检查状态；未直接写来源表。 |
| 08-08 | PARTIAL | `workflow/src/flowable-rest.test.ts`、`runtime.integration.test.ts` | 有失败映射/集成测试，但尚无 API/Worker 跨组件恢复报告。 |

### 09 Task Center 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 09-01～09-03 | VERIFIED_REPO | `task-center/src/service.test.ts`、`postgres-store.integration.test.ts`、`apps/worker/src/task-projection-composition.test.ts` | 投影、幂等和乱序测试存在。 |
| 09-04 | VERIFIED_REPO | `task-center` 的授权 `reconcile`、权威 `sourceReader`、同版本漂移修复和旧版本保护均有 Memory/Service/PostgreSQL tests；Worker reconciliation handler 受测；本轮 PostgreSQL 4/4 | 仓库级漂移检测、修复、重复/旧快照与失败关闭证据存在；生产对账运行记录仍属于外部激活证据。 |
| 09-05 | VERIFIED_REPO | Task Center Router、Walking Skeleton source command schema/handler、浏览器 Task POST 与耐久组合 E2E | Task Center 将完成路由回精确测试来源命令，投影由后续生命周期事件关闭；生产通用 Source Router 仍失败关闭。 |
| 09-06 | VERIFIED_REPO | `contracts/app-registry/deep-link.v1.schema.json`、`task-center/src/contracts.test.ts` | 稳定 App/Route ID 合同受测。 |
| 09-07 | PARTIAL | `apps/api/src/composition-factory.test.ts`、Task HTTP 查询组合 | 有查询授权，缺任务详情深链全链重新授权 E2E。 |
| 09-08 | VERIFIED_REPO | Task 与 Notification 分属独立模块/Schema，相关 service tests | 独立事实边界可由仓库和测试确定。 |

### 10 Notification 验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 10-01～10-06 | VERIFIED_REPO | `notifications/src/service.test.ts`、`template.ts`、`contracts.test.ts`、`postgres-store.integration.test.ts`、`apps/workbench-web/src/runtime.ts` 与页面测试 | 幂等、快照、列表状态、模板版本和 PC 轮询有直接证据。 |
| 10-07 | VERIFIED_REPO | `contracts/asyncapi/walking-skeleton.asyncapi.yaml`、`walking-skeleton-notification-handler.ts`、Rabbit adapter retry/DLQ tests、`e2e:rabbit-jobs` 和组合 E2E | 测试专用 Notification Job 使用固定重试/隔离拓扑，重复投递保持一个站内事实；不授权生产 Notification Consumer。 |
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
| 17-01 | VERIFIED_REPO | `e2e:browser-auth:integration`、`browser-authentication-bff.ts` | 真实 Chromium/Keycloak/BFF 登录已执行；使用隔离合成身份。 |
| 17-02 | VERIFIED_REPO | `browser-authentication-bff.ts`、`browser-authentication-bff.test.ts`、当前树 `e2e:combined-evidence:integration` | Organization/Authorization 公共服务在真实浏览器路径验证允许、无关联、inactive Employment 和无权限；三类拒绝均返回 403。仅代表隔离合成身份的仓库级 E2E。 |
| 17-03 | VERIFIED_REPO | `e2e:combined-evidence:integration`、`platform-chain.test.ts`、Workbench Registry/导航页面测试 | 同一认证浏览器执行已加载 Registry 快照、解析 Deep Link 并完成 Workbench 导航；仅代表隔离本地组合证据。 |
| 17-04～17-07 | VERIFIED_REPO | `main-chain.ts`、`durable-main-chain.ts`、真实 Flowable/RabbitMQ/PostgreSQL 组合运行 | 发布版本化合成 Form/BPMN、创建 Flowable Task、生成 Task 投影和站内 Notification 均在可执行组合中断言。 |
| 17-08 | VERIFIED_REPO | `e2e:combined-evidence:integration`、Workbench Task/Notification Query polling tests、耐久主链 Task/Notification 证据 | fresh BFF Session 已从 PostgreSQL 查询并观察同一耐久主链的 Task/Notification。 |
| 17-09 | VERIFIED_REPO | `e2e:file-clamav:integration`、`e2e:combined-evidence:integration`、PostgreSQL submission evidence、客户端表单渲染测试 | 同一认证浏览器执行已渲染并提交 Form UI，稳定 `available` FileReference 与 Task 完成、Worker 和 Audit 证据形成同一因果链。 |
| 17-10 | VERIFIED_REPO | 浏览器 Task POST、`e2e:combined-evidence:integration` | 浏览器使用真实 Session/CSRF 完成 Task，并与后续耐久链的因果证据匹配。 |
| 17-11～17-13 | VERIFIED_REPO | Walking Skeleton Workflow/Source/Notification Job 合同与 handlers、`main-chain.ts`、组合 E2E | Workflow 请求测试来源正式命令，来源重新授权并接受；最终 Task 投影为 `completed`、来源版本为 2、结果通知为 1。 |
| 17-14～17-15 | VERIFIED_REPO | `main-chain.ts`、Rabbit Inbox 重复证据、浏览器拒绝及 HTTP 重放场景 | 同一成功 HTTP 命令和重复消息没有重复 Flowable、来源或 Notification 副作用；无关联、inactive Employment、无权限、错误 CSRF、旧/过期 Session 和伪造回调被服务端拒绝。 |
| 17-16 | VERIFIED_REPO | `e2e:combined-evidence:integration`、`durable-evidence.ts`、`CURRENT-ENVIRONMENT-EVIDENCE.md` | 浏览器来源 W3C Trace 精确匹配 BFF/API 接受的命令以及 2 条 Outbox、2 条 Worker 消息、2 条 Inbox 和 30 条耐久 Audit。 |
| 17-17 | VERIFIED_REPO | 30 条耐久 Audit、observability sanitize/logger/sentry tests、`e2e:combined-evidence:integration` | Audit 可沿同一 Trace 追溯，且安全相关 verifier 已通过；真实日志和托管 Sentry 抽样仍归第 18/22 节及 G5 外部验收，不作为第 17 节本地组合缺口。 |

### 18 可观测与健康验收

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 18-01 | VERIFIED_REPO | `observability/src/logger.test.ts` | 单行 JSON 日志直接受测。 |
| 18-02 | EXTERNAL_BLOCKED | `deploy/observability/README.md` | 需实际主机日志轮转、磁盘上限和触发证据。 |
| 18-03 | VERIFIED_REPO | 组合 E2E 的 browser Trace、Task command、Outbox/Worker/Inbox/Audit 精确相等断言；observability context/trace tests | Trace/Request/Message/Correlation 标识的仓库级关联机制和浏览器到 Worker 主因果链已执行。 |
| 18-04 | PARTIAL | observability Sentry tests 与部署配置 | 缺真实托管 Sentry Release/Environment 事件。 |
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
| 20-07～20-11 | EXTERNAL_BLOCKED | `scripts/backup/recovery-evidence.mjs`、`scripts/backup/recovery-evidence.example.json`、`scripts/check/backup-recovery.test.mjs`、`scripts/backup/README.md` 与 `.handoffs/OPS-02-REPOSITORY-FOUNDATION.md` | 仓库已有证据 Manifest 和失败关闭结构门；仍需真实故障域外 PostgreSQL 基础备份/连续 WAL、三库分别恢复、RabbitMQ 重建及 Outbox/Inbox/业务状态对账、空主机或等价隔离恢复和实测报告。合成引用不能替代这些外部证据。 |

### 21 独立 Review Pass

| 编号 | 状态 | 直接证据 | 尚缺 |
|---|---|---|---|
| 21-01～21-08 | VERIFIED_REPO | `.handoffs/CURRENT-G5-INDEPENDENT-REVIEW.md`、`.handoffs/E2E-01-LOCAL-REVIEW.md`、Walking Skeleton closeout handoff 与 `.handoffs/OPS-02-REPOSITORY-FOUNDATION.md` 记录八维问题、处置和测试，无开放 P0-P3 | 只闭合仓库候选和本地 E2E 的 Review；OPS-01/OPS-02 外部执行完成后仍须对实际报告分别独立 Review。 |

## 6. 关键阻断

1. **真实外部证据：11 项。** 真实 COS、日志轮转、主机 SSH、Secret 演练、灾备/恢复、预发布发布回滚等必须在受控环境执行。OPS-02 仓库门只能拒绝不完整或不安全的证据 Manifest，不会把合成引用转换成外部验收证据。
2. **仓库证据仍非生产签收。** 166 项 `VERIFIED_REPO` 只说明存在直接、可重复的仓库或隔离本地执行证据；当前候选没有预发布/生产运行和最终 G5 签收包。
3. **24 项仅部分闭环。** 主要缺口是真实 Sentry/日志/慢查询抽样、真实环境隔离、破坏性迁移环境记录、主机和发布接线。
4. **生产合同边界仍失败关闭。** 测试专用 Walking Skeleton 合同将 `CONTRACT_BLOCKED` 归零，但没有授权通用或生产 Notification/Workflow/File Job Consumer；生产 generic Task Source Router 仍应失败关闭。
5. **真实镜像已构建发布但未部署。** `9fa4e2c` 曾有受信远端镜像发布证据；当前 Walking Skeleton 提交 `a7c3e90` 仍缺对应的受信 CI/不可变 digest、预发布拉取、non-root 运行、健康、逐台发布、Worker Drain 和回滚证据。
6. **权威清单计数漂移。** `010ffa4` 新增两个数据库/Prisma 项后，当前清单是 201 项；所有后续报告和签收包必须使用 201，不能继续沿用旧 199 统计。

## 7. 建议的证据闭环顺序

1. 将当前 `pnpm check`、E2E、应用/镜像版本、合同 Bundle/生成 Client 和迁移清单整理为 G5 候选证据；保存完整命令、版本、退出码和日志，不只保存摘要。
2. 在首个测试服/预发布环境验证当前 API/Worker digest 拉取、non-root 运行、迁移 Manifest、Fixture/Source Map/Secret 排除、健康、Nginx 流量、逐台发布、Worker Drain 和回滚。
3. 使用受控环境执行 OPS-02：故障域外 PostgreSQL 基础备份/连续 WAL、`ai_crm`/Keycloak/Flowable 分别恢复、RabbitMQ 拓扑重建和 Outbox/Inbox/业务状态对账、加密 Secret 应急包及空主机等价恢复。
4. 补充实际日志/托管 Sentry 敏感数据抽样，作为 G5 强制外部证据。
5. 对 OPS-01/OPS-02 实际报告执行八维独立 Review，记录恢复点、耗时和数据差异，不发明 SLA/RPO/RTO、Owner、保留期、主机身份、Bucket 或凭据。
6. 只有证据文件经过复核后，才由验收 Owner 在权威清单逐项勾选；不得根据本审计批量勾选。依据 ADR-0029，G4 本地验收通过且试点启动清单完整后可开始一个本地开发期 CRM 领域模块；G5 前不得将其部署到预发布或生产。

## 8. 审计自检

- 编号计数：20 个章节，当前权威清单 201 项；五类状态为 166/24/11/0/0，合计 201。旧 199 口径的两项差异已经定位到第 6 章 `010ffa4` 新增项。
- 证据基线：`a7c3e90` 加本轮未提交文档候选；E2E 预检 `contractBlockers=[]`、`implementationGaps=[]`、`mainWalkingSkeletonReady=false`。静态预检不执行 combined gate；API/Worker external skip、未部署环境和真实遥测抽样未被误计为完整外部通过。
- 权威验收清单第 17 节已按本地组合证据更新，其余清单项与合同未批量修改。
- 当前代码增量、视觉复验、OPS-02 仓库级证据门和独立 Review handoff 均已在本审计中列出直接证据；OPS-02 外部项目的状态与总统计未改变。
- `output/`：未读取、未修改。
- 生产/外部系统：未访问。
- 本文件未写入 Secret、个人数据、真实 Provider Payload 或生产标识。
