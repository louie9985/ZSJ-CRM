# E2E-01 本地路径独立复审

- 复审日期：2026-07-30
- 复审范围：E2E 环境预检、PostgreSQL 集成 Runner 清理修复、验收证据更新
- 结论：当前增量无剩余 P0-P3；主 E2E 仍未实现，五项合同阻塞保持关闭

## 问题与处置

| 优先级 | 问题 | 处置 |
|---|---|---|
| P1 | 初版预检可能被理解为自动证明五项合同在全仓不存在。 | 输出改为 `manual-snapshot-with-anchor-checks`，README 与证据明确要求合同/组合变化时人工更新快照。 |
| P2 | 初版 Notification 描述忽略了通用 Handler factory 已存在。 | 改为精确边界：缺少经评审 AsyncAPI 拓扑、生产组合和激活；不再声称完全没有 Handler。 |
| P1 | 七个使用 `docker run postgres:17.5-alpine` 的集成 Runner 删除容器时未带 `--volumes`，会留下匿名数据卷。 | 统一改为 `docker rm --force --volumes`，静态门自动覆盖所有直接 Docker PostgreSQL Runner；七个 Runner 29/29 通过，dangling Volume 集合运行前后保持 `139 -> 139`。 |

## 八维复审

| 维度 | 结论 |
|---|---|
| Authorization | 未新增权限、角色、公开路由或生产消费者；缺失来源权限继续失败关闭。 |
| Idempotency | 未改变 HTTP、Event、Job、Workflow 或投影幂等语义；主链重复副作用仍因来源合同缺失保持阻塞。 |
| Transactions | 未修改生产事务；PostgreSQL 专项只修正测试资源清理。 |
| Migrations | 未修改迁移；当前无已部署数据库的用户确认已写入审计，首次共享环境证据仍待执行。 |
| Observability | 预检只输出稳定技术状态与证据路径，不输出 Secret、Cookie、Token、业务正文或个人数据。 |
| Backward Compatibility | 未改变公共 HTTP/Event/Job/包契约；新增根脚本与测试门为兼容性增量。 |
| Secrets | 预检不创建或读取 Secret 值；集成 Runner 原有临时 Secret 生命周期不变，成功清理同时删除匿名卷。 |
| Failure Modes | Node、Docker、Compose、服务拓扑或证据锚点漂移时预检失败；主链始终返回 `mainWalkingSkeletonReady=false`。 |

## 新鲜验证

- `pnpm e2e:check`：2/2。
- `pnpm e2e:preflight`：通过，七服务、依赖限定范围和五项阻塞快照正确。
- PostgreSQL Runner 清理门：3/3。
- 七个直接 Docker PostgreSQL Runner：29/29。
- `pnpm check`：140/140 Turbo 任务通过。
- `git diff --check`：通过。

复审不接受真实 COS、服务器、预发布/生产、OPS-02 或第 17 章主链；这些能力没有在本地增量中出现。
