# G5 第一阶段签收状态

- 状态：`EXTERNAL_BLOCKED`
- 日期：2026-08-02
- 候选基线：`a7c3e90`
- 范围：第一阶段 G5 必需证据汇总与剩余外部验收边界

## 已知事实

- Walking Skeleton 本地业务中立组合验收已通过；`mainWalkingSkeletonReady=true`，组合验收状态为 `e2e-browser-to-worker-causal-evidence-passed`，权威清单第 17 节 17/17 已完成，G4 为 `PASSED_LOCAL`。
- 当前树完整 `pnpm check` 通过 133/133 Turbo tasks；API 193 passed/5 skipped，E2E 75/75，Workbench 34/34。Authorization Redis 集成通过受支持的 Secret-file override 连接运行中的 dev Redis，未跳过该集成测试。
- 当前机器 Docker Engine 29.6.2 可用；修改后的容器级组合 E2E 已重跑通过。真实镜像 Registry、预发布发布/回滚和恢复演练仍未执行。
- 项目没有可供本任务使用的共享测试、预发布或生产环境，也没有已批准的恢复 Owner、复核人、故障域外备份目标和 Secret 离线私钥托管事实。
- `docs/02-业务规则/` 尚无已确认业务规则，`packages/domain-modules/` 只有边界说明，没有正式 CRM 模块。
- 权威验收清单当前实际包含 201 项；第 17 节四个旧部分项闭合后的最新审计为 `VERIFIED_REPO 166 / PARTIAL 24 / EXTERNAL_BLOCKED 11 / CONTRACT_BLOCKED 0 / NOT_IMPLEMENTED 0`。
- `.handoffs/CURRENT-G5-INDEPENDENT-REVIEW.md` 的最终复审无剩余 P0-P3；该结论只覆盖当前仓库候选，不覆盖外部发布与恢复执行。

## 允许的假设

- 已提交且可重复执行的合成/本地证据可以证明仓库行为，但不能替代预发布、生产、真实 Provider、真实主机或灾难恢复证据。
- `evidence://` 与 SHA-256 是后续受控证据库的结构约定，不证明引用内容真实或已获批准。

## 禁止的假设

- 不把示例 Release/Recovery Manifest、静态 Compose 检查或本地 Docker 测试解释为真实部署、回滚、备份或恢复已经完成。
- 不虚构镜像 Digest、COS Bucket、CAM 身份、主机、域名、Owner、复核人、Secret、恢复点、耗时、数据差异、SLA、RPO 或 RTO。
- 不因 Walking Skeleton 通过而创建 Lead、Customer、Order、Settlement 或其他未确认 CRM 模块。

## 非目标

- 本记录不执行真实发布、DNS/流量切换、生产迁移、备份、PITR、Secret 解密或主机安全变更。
- 本记录不修改权威验收清单的复选框，也不授予正式验收权限。

## 第 22 节证据矩阵

| 必需证据 | 状态 | 当前证据 | 完成条件 |
|---|---|---|---|
| `pnpm check` 完整输出 | VERIFIED_LOCAL | 当前树 133/133，Redis 集成启用；见 `tests/e2e/CURRENT-ENVIRONMENT-EVIDENCE.md` | 最终提交后由受信 CI 保存提交寻址输出 |
| 应用和镜像版本清单 | PARTIAL | 五个应用均为仓库版本 `0.0.0`；生产 Release Manifest 格式和 Digest 门存在 | 受信 Registry 的实际 API/Worker Digest 及预发布拉取记录 |
| 合同 Bundle/生成 Client | VERIFIED_REPO | 本轮 `contracts:check` 29/29，确定性生成门纳入 `pnpm check` | 最终提交后由受信 CI 保存结果 |
| 数据库迁移清单 | VERIFIED_REPO | 生产迁移 `0000000001`～`0000000015`；E2E 测试迁移 `0000000016`～`0000000018` 独立存在；迁移制品门已实现 | 首个共享环境保存实际应用清单、checksum、备份点和锁影响 |
| Walking Skeleton E2E | VERIFIED_LOCAL | 提交 `a7c3e90` 已闭合 Workbench Registry/Deep Link、Form UI/服务端提交、稳定 FileReference、Task 完成/重放、耐久 Task/Notification 观察及 Trace/Audit 关联，第 17 节 17/17 完成 | 最终提交后由受信 CI 保存提交寻址输出；真实日志/Sentry 抽样仍是独立外部签收项 |
| 授权拒绝和幂等故障报告 | VERIFIED_LOCAL | 主链覆盖拒绝、过期、依赖故障、重试、恢复和重复投递 | 外部环境发布后按相同候选抽样 |
| 日志/Sentry 敏感数据抽样 | PARTIAL | 清洗、日志和 Sentry Adapter 自动化测试通过 | 真实预发布日志与托管 Sentry Release/Environment 抽样报告 |
| 预发布部署与回滚报告 | EXTERNAL_BLOCKED | OPS-01 发布门和 Runbook 已实现 | Digest 拉取、non-root、迁移、健康、逐台发布、Worker Drain、Nginx 流量及回滚实测 |
| PostgreSQL/WAL、Keycloak、Flowable、Secret 恢复报告 | EXTERNAL_BLOCKED | OPS-02 Manifest 校验 13/13，通过结构门 | 故障域外基础备份/连续 WAL、三库独立恢复、RabbitMQ 对账、加密应急包和隔离空主机演练 |
| 已知限制和待业务确认清单 | VERIFIED_REPO | 本文件及现有架构/模块 handoff | 验收 Owner 复核并接受仍保留的业务决策缺口 |

## OPS-01 外部执行入口

当前复核见 `.handoffs/CURRENT-OPS-01-VERIFICATION.md`：仓库专项 34/34、Compose 静态门、四份合成渲染和 drain 数值门通过。外部发布必须使用真实、受审候选生成 Release Manifest，并解析、重算其中证据摘要。至少保存不可变镜像拉取、容器用户、迁移 Manifest、健康检查、逐台发布、Worker Drain、Nginx 流量、回滚结果及日志/Sentry 脱敏抽样。仓库中的 `deploy/releases/release-manifest.example.json` 仅是合成结构示例。

## OPS-02 外部执行入口

真实演练需先具备受控测试/预发布拓扑、私有加密故障域外存储、最小权限身份、正式且不同的 operator/approver 和受控证据库。随后按 `scripts/backup/README.md` 生成真实 Manifest，分别证明 `ai_crm`、`keycloak`、`flowable` 恢复、WAL 连续性、RabbitMQ/Outbox/Inbox/业务状态对账、加密 Secret 应急包、空主机恢复以及主机失陷/凭据泄露/离职回收演练。

## G5 决策

G5 当前保持 `EXTERNAL_BLOCKED`，G4 为 `PASSED_LOCAL`。本地业务中立 Walking Skeleton 和仓库级发布/恢复门已经实现，但对应外部证据仍未完成；外部发布、真实 Provider/主机遥测与恢复工作不能在缺少受控环境和正式治理身份时被真实执行。依据 ADR-0029，满足试点启动清单的一个业务模块可仅在本地开发；第一阶段仍不能标记完成，且任何业务模块不得部署到预发布或生产。
