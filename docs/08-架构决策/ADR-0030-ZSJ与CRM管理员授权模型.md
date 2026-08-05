# ADR-0030：ZSJ 与 CRM 管理员授权模型

- 状态：身份、凭证和动态 Grant 部分已被 ADR-0034 取代；稳定管理员角色边界继续有效
- 日期：2026-08-02

## 背景

本地开发试点需要一个不属于部门、岗位或普通角色的 `ZSJ系统管理员`，以及一个属于 `AI应用部 / 系统管理岗` 的 `CRM系统管理员`。现有授权策略 v1 只有权限声明、角色和角色授权，无法表达前者，也没有权限所属应用及稳定角色键。

已知事实是：Keycloak 只负责认证；Organization 拥有人员、Employment 和 Assignment；Authorization 拥有应用权限判断。允许的假设仅限本地试点存在一个受控 ZSJ 系统管理员和一个固定 CRM 管理员角色。不得据此推导其他业务角色、组织岗位权限、生产管理员或 CRM 业务权限。

## 决策

1. Authorization Policy v2 增加 `schemaVersion: 2`。Permission 必须声明 `applicationId`；Role 必须声明稳定 `roleKey` 和 `displayName`；Super Administrator Grant 与 Role Grant 分开存储。
2. ZSJ 系统管理员仍必须解析为唯一 Workforce Person 和有效 Employment，但不需要部门、岗位、Assignment 或 Role Grant。它通过有有效期的 Super Administrator Grant 获得所有**已在当前策略声明**的权限。请求未知权限时继续拒绝。
3. Super Administrator Grant 只绑定 Workforce Person，不允许绑定 Assignment，不允许由岗位名称、Keycloak Role/Group、用户名或手机号推导。授权判定和耐久 Audit 使用稳定 ID，不记录个人资料或登录标识。
4. `CRM系统管理员` 是固定授权角色，不等于“系统管理岗”。其 Role Grant 必须绑定 AI 应用部的有效 Assignment；Assignment 关闭或调离即失效。角色包含所有经评审并声明为 `applicationId=crm` 的权限，以及明确列入角色的员工访问管理平台权限。
5. 授予或撤销固定 CRM 管理员角色需要 ZSJ 系统管理员权限。普通 CRM 管理员不得读取、修改或推导 ZSJ 系统管理员及其 Grant。
6. 读取端兼容完整有效的 v1 与 v2 快照。发布端从本 ADR 起只接受 `authorization-policy.v2`，并要求快照与契约版本一致。v1 历史事实保持不可变；升级通过追加并发布新的 v2 快照完成。
7. v2 角色键、权限代码、Permission 的 resource/action 组合和 Grant ID 必须唯一。Grant 使用半开有效期 `[validFrom, validTo)`。无当前完整策略、策略无效或依赖故障时一律失败关闭。
8. 新增业务中立的 `workforce-access` 平台模块并由其独占账号目录、规范化登录标识及历史占用、Keycloak User 稳定映射、Provisioning 状态、revision、Operation ID 和耐久操作收据。它只通过 Organization 与 Authorization 的公开端口组合，不查询二者表；Organization 继续独占实名档案、Employment、Assignment、部门、岗位及名称历史，Keycloak 继续独占凭证和认证状态。
9. 密码、密码确认、临时密码和首次登录改密只在 Keycloak 托管的 Credential Ceremony 内提交给 Keycloak。Workbench、BFF/API、`workforce-access`、Outbox/Job、Audit、日志和 Trace 均不得接收或保存密码。Ceremony capability 必须短时、单次，绑定操作者、目标账号和稳定 Operation ID；完成回调只能证明该 Ceremony 已由 Keycloak 接受，账号激活仍由服务端重新授权并校验当前状态。
10. 账号状态固定为 `provisioning`、`credential_pending`、`active`、`disabled`、`failed`。创建 Keycloak 用户时先保持 disabled；只有组织事实、授权资格及 Credential Ceremony 均成功后才可 enable。停用先在本地事务关闭访问、Employment、Assignment 与相关 Grant，再通过耐久 Outbox Job 禁用 Keycloak 并撤销 Session；Keycloak、RabbitMQ 或 Worker 故障不得恢复本地访问。异步操作按稳定 Operation ID 幂等重放，消费前重新核对当前账号状态、Keycloak 映射和登录标识，过期 Job 不产生副作用。
11. 用户名同时保存原始显示值与小写规范值，所有历史用户名永久占用。手机号先规范化并全局唯一；旧手机号默认继续占用，只有它已不是当前手机号且管理员执行显式、授权、带 revision 的释放命令后才可复用。修改标识不得用手机号、用户名或姓名自动关联 Keycloak 主体；ZSJ 系统管理员修改自身标识前必须在 BFF 发起 `prompt=login` 重新认证，成功后撤销自身全部 Session。
12. 浏览器写请求必须具有 BFF HTTP-only Session、CSRF、幂等键和乐观并发 revision。Keycloak 同步 Job 固定使用三次总尝试、5/30 秒延迟和 10 秒处理截止时间，失败后隔离且不自动重放。W3C Trace 可贯穿 Browser、BFF、API、Outbox、Worker 和 Keycloak Adapter，但 Trace 不是 Audit；Audit 只保存稳定账号、组织、操作和授权引用，不保存姓名、手机号、登录名、凭证、Cookie、Token 或请求体。

## 影响与取舍

- 超级管理员不依赖组织 Assignment，能够处理组织初始化和恢复，但必须由受控初始化或恢复入口管理，不能暴露为普通角色编辑功能。
- 新增已评审权限会自动落入超级管理员的权限范围；CRM 管理员是否获得该权限仍由 v2 策略构建规则和应用归属决定。未知或未发布权限不会自动放行。
- v1 双读允许滚动升级和历史审计回放；只写 v2 避免继续制造缺少应用归属的新事实。
- 策略快照原本以带契约版本的不可变 JSONB 文档持久化，本变更不修改表结构、无需数据回填或 SQL 迁移。回退时保留 v2 历史事实和当前指针，并前向修复；不得改写或删除已发布快照。
- 本决策不创建生产首策略发布入口，不放宽 ADR-0025 的审批、审计、幂等和不可变历史要求。

## 备选方案

1. **使用 Keycloak Group/Role 同时表达部门、岗位和 CRM 授权**：未采用。它会形成第二套组织与授权事实源，无法可靠表达有效期 Assignment、模块表所有权、对象级授权和耐久业务审计。
2. **把 ZSJ 系统管理员建成普通“超级管理员角色”**：未采用。普通 Role Grant 依赖组织上下文且会把受控根授权暴露给角色编辑能力，无法满足无 Assignment 的初始化与恢复入口，同时扩大误授权面。
3. **由 API 接收管理员设置的密码后调用 Keycloak Admin API**：未采用。密码会经过 BFF/API 的内存、错误处理和观测边界，增加泄漏面；Keycloak 托管的短时 Credential Ceremony 能保持凭证边界并统一首次改密。
4. **停用时同步等待 Keycloak 成功，失败则回滚本地停用**：未采用。这会在身份提供方故障时维持已决定撤销的本地访问。当前方案先本地失败关闭，再以耐久 Job 收敛 Keycloak 状态。
5. **手机号或用户名变更后立即释放旧值**：未采用。立即复用会带来账号误关联、审计歧义和延迟同步竞争；显式释放保留了管理员意图、revision 冲突检查和耐久审计事实。

## 非目标与替换条件

本 ADR 不定义更多系统管理员、通用角色编辑器、Keycloak 管理角色、CRM 业务模块权限或生产部署。若需要多个超级管理员、临时提权审批、Break-glass 生产流程或跨应用管理员层级，必须以新 ADR 替换或扩展本决策。

## 后续扩展

ADR-0033 在不改变本 ADR 的 ZSJ 与 CRM 管理员边界前提下，新增独立的 `crm.application-user` 基础访问角色、Assignment 绑定 Grant、账号生命周期收敛、顶层 CRM 应用注册和代码级 Workspace profile 解析。管理员 Grant 与基础访问 Grant 始终是两个独立事实。
