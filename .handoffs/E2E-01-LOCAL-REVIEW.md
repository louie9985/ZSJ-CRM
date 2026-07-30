# E2E-01 本地路径独立复审

- 复审日期：2026-07-30
- 复审范围：E2E 环境预检、PostgreSQL 集成 Runner 清理、`@ai-crm/e2e` Workspace 与业务中立进程内联合切片、验收证据更新
- 结论：当前增量无剩余 P0-P3；主 E2E 仍未实现，五项合同阻塞保持关闭

## 问题与处置

| 优先级 | 问题 | 处置 |
|---|---|---|
| P1 | 初版预检可能被理解为自动证明五项合同在全仓不存在。 | 输出改为 `manual-snapshot-with-anchor-checks`，README 与证据明确要求合同/组合变化时人工更新快照。 |
| P2 | 初版 Notification 描述忽略了通用 Handler factory 已存在。 | 改为精确边界：缺少经评审 AsyncAPI 拓扑、生产组合和激活；不再声称完全没有 Handler。 |
| P1 | 七个使用 `docker run postgres:17.5-alpine` 的集成 Runner 删除容器时未带 `--volumes`，会留下匿名数据卷。 | 统一改为 `docker rm --force --volumes`，静态门自动覆盖所有直接 Docker PostgreSQL Runner；七个 Runner 29/29 通过，dangling Volume 集合运行前后保持 `139 -> 139`。 |
| P2 | 初版 Notification preference reason 含空格，不满足稳定标识格式，联合测试返回 `NOTIFICATION_INPUT_INVALID`。 | 改为 `synthetic-default`，包级测试 2/2 通过。 |
| P2 | 初版 Task 来源写作 `workflow`，且 Task/Notification 深链未经过 Registry，可能误示 Workflow 已组合并削弱联合证据。 | 来源改为 `platform.synthetic`；两类深链均显式转换并通过 Registry 公共 API 解析。 |

## 八维复审

| 维度 | 结论 |
|---|---|
| Authorization | Task 详情拒绝由服务端公共 API 执行并产生失败审计；允许策略只是合成测试桩，不代表生产授权。 |
| Idempotency | 进程内验证同一 Task 事件返回 `duplicate`、同一 Notification producer/key/payload 返回相同结果；不覆盖 Inbox、Workflow 或正式来源副作用。 |
| Transactions | 联合切片使用 Memory Store，未修改生产事务，也不证明跨模块原子性；PostgreSQL 专项只修正测试资源清理。 |
| Migrations | 未修改迁移；当前无已部署数据库的用户确认已写入审计，首次共享环境证据仍待执行。 |
| Observability | 联合切片只使用合成标识和安全审计元数据；未新增运行日志或跨进程 Trace 证据，不输出 Secret、Cookie、Token、个人数据或客户内容。 |
| Backward Compatibility | 新增私有 E2E Workspace，只通过五个平台模块公共入口调用；未改变 HTTP/Event/Job/Schema 契约。 |
| Secrets | 预检不创建或读取 Secret 值；集成 Runner 原有临时 Secret 生命周期不变，成功清理同时删除匿名卷。 |
| Failure Modes | Task `complete/reconcile` 的阻塞桩未被调用；Node、Docker、Compose、服务拓扑或证据锚点漂移时预检失败；主链始终返回 `mainWalkingSkeletonReady=false`。 |

## 新鲜验证

- `pnpm e2e:check`：2/2。
- `pnpm e2e:preflight`：通过，七服务、依赖限定范围和五项阻塞快照正确。
- `pnpm --filter @ai-crm/e2e test`：2/2；Lint、Typecheck、Build、Contracts Check 均通过。
- PostgreSQL Runner 清理门：3/3。
- 七个直接 Docker PostgreSQL Runner：29/29。
- `pnpm check`：145/145 Turbo 任务通过。
- `git diff --check`：通过。

统一审计证据只覆盖 App Registry、Form Schema、Task Center、Notifications 四个公开 Audit port；Organization 的内存公共工厂没有可注入 Audit port，未伪造其审计。复审不接受真实 COS、服务器、预发布/生产、OPS-02 或第 17 章主链；这些能力没有在本地增量中出现。
