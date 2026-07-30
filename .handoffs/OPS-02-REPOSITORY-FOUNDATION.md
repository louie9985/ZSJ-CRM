# OPS-02 仓库级恢复证据基础

- 状态：`REPOSITORY_FOUNDATION_ONLY`
- 日期：2026-07-30
- 范围：恢复证据 Manifest、失败关闭校验与仓库自动化测试
- 外部验收状态：`BLOCKED`（项目尚未部署，且没有共享测试、预发布或生产环境）

## 目标

为后续 PostgreSQL/WAL、分库恢复、RabbitMQ 重建与对账、离线 Secret 应急包和隔离恢复演练建立机器可校验的证据载体。仓库门只验证证据结构、相互约束、摘要绑定和敏感字段排除，不替代真实备份、恢复或人工批准。

## 已知事实

- 当前项目从未部署到服务器，没有共享测试数据库、预发布数据库或生产数据库，只有当前电脑的 Docker 本地环境。
- PostgreSQL 当前包含 `ai_crm`、`keycloak` 和 `flowable` 三个需要分别恢复验证的数据库。
- 第一阶段目标拓扑是两台腾讯云 Ubuntu CVM 上分别运行的 Docker Compose Project；单实例状态组件依赖人工恢复，不具备自动故障转移证明。
- 已接受 ADR 要求 PostgreSQL 基础/全量备份与连续 WAL 离开两台服务器故障域，并要求从空主机或等价隔离环境执行恢复演练。
- RabbitMQ 是传输层；恢复不能只看 Broker 数据，必须重建拓扑并对 Outbox、Inbox 和业务状态进行对账。
- 日常备份不得包含明文 Secret 根目录；最小灾难恢复 Secret 应急包须在上传前使用 `age` 离线公钥加密，解密私钥不得与生产主机、普通运维电脑、Git、COS 或同一备份包共存。
- COS 已在 `ap-guangzhou` 开通，但真实备份 Bucket、CAM 最小权限身份、加密配置和生命周期尚未确认；本地开发不使用主账号 Secret 绕过 CAM 边界。
- RPO、RTO、备份保留期、演练频率、正式 Owner、复核人和恢复顺序尚未批准。

## 允许的假设

- `evidence://` 引用和 `sha256:<64 个十六进制字符>` 摘要可作为受控证据库接线前的稳定结构约定。
- 仓库中的示例 Manifest 只使用明显合成、非权威的引用和格式占位摘要，不对应真实基础设施、人员、凭据或恢复结果。
- 校验器可以拒绝字段缺失或越界、自相矛盾、同故障域、同人操作/复核、布尔自报门禁和 Secret-like 字段；这些拒绝只证明仓库门失败关闭。
- 后续受控环境可在不改变证据语义的前提下，把仓库约定接入真实证据存储、摘要重算和身份/审批系统。

## 禁止的假设

- 不把示例 Manifest、校验通过、单元测试或本地合成数据测试解释为真实备份已生成、WAL 已连续归档或数据库已恢复。
- 不把 `evidence://` 引用本身解释为底层证据真实、完整、可信或已获批准；真实执行时仍须解析引用、重算摘要并核验来源身份。
- 不虚构 COS Bucket、CAM 子用户/角色、真实主机、数据库内容、生产 Secret、`age` 私钥、恢复点、耗时或数据差异。
- 不填写或推定 RPO、RTO、保留期、演练频率、Owner、值班人、批准人或双人复核流程已经确定。
- 不使用腾讯云主账号 Secret 作为备份写入、读取或演练凭据。
- 不把 RabbitMQ 队列恢复等同于业务恢复，也不把 Redis 视为业务唯一事实源。

## 非目标

- 不执行 PostgreSQL `pg_basebackup`、逻辑导出、WAL 归档、时间点恢复或破坏性恢复操作。
- 不访问或配置真实 COS、CAM、CVM、数据库、RabbitMQ、Keycloak、Flowable 或 Secret 文件。
- 不创建真实 Secret、不生成或托管 `age` 密钥、不制作真实 Secret 应急包。
- 不执行空主机/隔离环境恢复、主机失陷、凭据泄露、离职回收或双人复核演练。
- 不声明第 19 章或第 20 章的外部验收项完成，不修改权威验收清单中的复选框。
- 不实现 CRM 领域模块、实体、字段、状态、权限、SLA 或审批路线。

## 仓库交付物

- `scripts/backup/recovery-evidence.mjs`：恢复证据 Manifest 的纯校验边界。
- `scripts/backup/verify-recovery-evidence.mjs`：命令行入口，验证指定 Manifest 并以失败退出码关闭不合规输入。
- `scripts/backup/recovery-evidence.example.json`：只含合成引用的结构示例，不是恢复报告。
- `scripts/check/backup-recovery.test.mjs`：覆盖正常结构和关键拒绝路径的自动化测试。
- `scripts/backup/README.md`：说明使用方法、证据语义和外部执行缺口。

## 授权与审计

- Manifest 必须区分 operator 与 approver，且两者不能相同；这只是最小职责分离结构，不授予任何真实权限。
- 每个外部事实必须绑定受控证据引用及内容摘要，不能以自由文本或布尔 `true` 自报通过。
- 真实恢复仍需受控操作身份、批准记录、证据库访问控制和不可变审计；仓库不保存真实人员或账号。

## 幂等、事务与迁移

- 校验器是纯读取、可重复执行的无副作用操作；相同输入应产生相同判定。
- 本任务不执行数据库事务或 Schema Migration，也不改变任何数据库。
- 后续恢复演练必须分别验证三个数据库的迁移身份和数据差异；应用镜像回滚不等同于数据库回滚。

## 可观测性、Secret 与失败模式

- 校验输出只报告有界路径和结构问题，不输出 Secret 值、数据库内容、原始 Provider Payload 或恢复制品内容。
- Secret-like 字段、可疑明文、缺少摘要绑定、WAL 连续性证据缺失、备份仍处于源故障域、三库证据不完整、RabbitMQ/Outbox/Inbox 对账缺失、同人操作复核等情况必须失败关闭。
- Secret 应急包只允许保存加密制品的外部证据引用；仓库、Manifest、测试 Fixture 和日志中均不得出现明文或私钥。

## 向后兼容

本基础新增仓库证据格式和检查，不改变开发/测试 Compose、数据库 Schema、运行服务或已接受合同。后续真实工具接入如需改变 Manifest 语义，应版本化并保留旧证据的可解释性。

## 独立 Review 结论

独立 Agent 按授权、幂等、事务、迁移、可观测、向后兼容、Secret 和失败模式八个维度复审。候选最初发现并关闭以下问题：

- `P1`：常见凭据格式可藏在普通字符串字段中。已增加 GitHub、云访问标识、Slack、模型密钥与 PEM 私钥标记的值级拒绝测试；错误只返回字段路径，不回显值。
- `P1`：三个数据库可复用同一组证据。现要求 `backupArtifact`、`backupEvidence`、`restoreEvidence`、`verificationEvidence` 的 `evidenceRef` 在 `ai_crm`、`keycloak`、`flowable` 间分别唯一，并加入回归测试。
- `P2`：空主机报告最初未结构化要求实际恢复点、耗时和数据差异。已拆成三项必需证据绑定。
- `P2`：大小写别名可绕过 operator/approver、源/目标环境和故障域区分。已按大小写规范化比较并加入拒绝测试。

处置后专项测试 13/13 通过，无剩余 P0～P3。真实身份别名解析、底层证据解析与重算、任意高熵 Secret 检测和系统读取错误的外部脱敏仍不由此纯结构校验器证明，必须在真实证据库接线与演练 Review 中复核。

## 验收影响

- 新增的是 OPS-02 的仓库级失败关闭基础，不是 OPS-02 外部恢复演练本身。
- `19-08～19-09` 仍为 `EXTERNAL_BLOCKED`：缺真实轮换/撤销/离职/泄露演练和离线私钥存放实证。
- `20-07～20-11` 仍为 `EXTERNAL_BLOCKED`：缺真实故障域外备份、连续 WAL、三库恢复、RabbitMQ 重建/对账、空主机或隔离恢复以及实测报告。
- 当前验收统计保持 `VERIFIED_REPO 139 / PARTIAL 26 / EXTERNAL_BLOCKED 12 / CONTRACT_BLOCKED 5 / NOT_IMPLEMENTED 17`，合计 199。

## 后续外部接入条件

只有在测试服或预发布/生产拓扑、独立 CAM 最小权限身份、私有加密 COS 目标、正式 Owner/复核人和受控证据库就绪后，才可执行真实 OPS-02。届时须保存真实 PostgreSQL 版本、基础备份与 WAL 边界、三个数据库分别恢复结果、RabbitMQ 拓扑与 Outbox/Inbox 对账、配置制品摘要、隔离目标、实际恢复点、耗时和数据差异；任何结果都不得被外推为未经批准的 SLA、RPO 或 RTO。
