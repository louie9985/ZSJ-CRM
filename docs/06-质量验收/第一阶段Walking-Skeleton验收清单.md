# 第一阶段 Walking Skeleton 验收清单

- 状态：执行中
- 认证基线：ADR-0034
- 证据必须来自当前代码和当前拓扑；旧身份拓扑的通过记录不能复用。

## G0 仓库与契约

- [ ] `pnpm install`、`pnpm repo:check`、`pnpm contracts:check` 通过。
- [ ] Workspace 只有 PC Web、内部 H5、API、Worker 和已确认包。
- [ ] 内部 OpenAPI 只包含 `pc`、`internal-h5` 的 login/session/reauthentication/assignment/logout。
- [ ] 不存在外部客户端、外部 OpenAPI、认证回调、refresh、凭证跳转或身份同步运行入口。
- [ ] 历史 SQL migration 未修改，新 schema 由版本化 migration 追加。

## G1 本地基础设施与数据库

- [ ] PostgreSQL、Redis、RabbitMQ、Flowable、ClamAV、Nginx 使用固定镜像版本并可重复启动。
- [ ] 空 PostgreSQL 卷执行全部 migration 成功。
- [ ] API/Worker 运行角色只拥有受审 schema 与表权限。
- [ ] 本地 Redis 从空卷启动，Session 与限流键均为当前格式。
- [ ] 生产 Secret 只使用受限文件引用，不出现在仓库、Compose 字面值、命令参数或日志中。

## G2 账号与密码

- [ ] Argon2id 参数固定为 64 MiB、3 iterations、parallelism 1、16-byte salt、32-byte hash。
- [ ] 密码规则为 8–64 位可打印半角 ASCII。
- [ ] 用户名和手机号规范化、当前唯一及历史占用测试通过。
- [ ] 不存在账号时执行 dummy hash 验证；不存在、密码错误和禁用账号返回相同错误。
- [ ] 密码、hash 和派生值不进入日志、审计、Trace、错误、响应或幂等 fingerprint。
- [ ] 重置密码替换 hash、递增 `securityRevision` 并使旧 Session 失效。

## G3 Session 与浏览器安全

- [ ] PC 使用 `__Host-ai_crm_pc_session`，内部 H5 使用 `__Host-ai_crm_internal_h5_session`。
- [ ] Cookie 为 host-only、`Path=/; HttpOnly; Secure; SameSite=Lax`。
- [ ] Session idle 30 分钟、absolute 8 小时，同账号同 surface 并发上限 1。
- [ ] 登录、重新认证、Assignment 切换和敏感操作后轮换 Session 与 CSRF。
- [ ] CSRF、Origin/Referer、过期、注销、错 surface 和旧 credential 均失败关闭。
- [ ] 登录限流为 15 分钟内标识 5 次、来源 30 次失败；索引使用服务端 keyed digest。

## G4 组织与授权

- [ ] 账号唯一关联 `workforcePersonId`；组织模块无认证主体关联。
- [ ] 无唯一 Person、无有效 Employment 或无有效 Assignment 时内部访问失败关闭。
- [ ] `system_administrator` 仅为全局角色。
- [ ] `application_user`、`crm_administrator` 必须绑定有效 Assignment。
- [ ] 当前权限只合并全局角色和当前 Assignment 角色，不合并其他 Assignment。
- [ ] Permission catalog 受审、无 wildcard，统一 `allow/deny` 对授权依赖故障失败关闭。
- [ ] 不存在动态策略发布、缓存或管理 surface。

## G5 原子管理命令与审计

- [ ] 创建账号在事务外计算 hash，在一个短 PostgreSQL 事务内创建 Person、Employment、Assignment、Profile、Account、Credential、基础角色和审计。
- [ ] 任一步失败全部回滚，不产生半账号、孤立任职或孤立角色。
- [ ] 成功幂等重放不再次处理密码；失败重试要求新的 `Idempotency-Key`。
- [ ] 禁用、调岗、离职和密码重置的授权、revision、事务与审计行为明确。
- [ ] 审计只含稳定 ID、动作、结果和安全关联引用。

## G6 客户端

- [ ] PC Web 和内部 H5 都提供简洁的用户名/手机号加密码登录表单。
- [ ] 两端复用 HTTP 契约但不共享 React UI 或 Cookie。
- [ ] development 与 production runtime 都调用真实同源 Session，不把 fixture 打入正式制品。
- [ ] 页面状态覆盖未登录、凭证错误、限流、依赖不可用、无权限、Assignment 选择与注销。
- [ ] 响应式布局、包体与无敏感信息检查通过。

## G7 E2E 与最终门禁

- [ ] PC 登录、session、logout 通过。
- [ ] 内部 H5 登录、session、logout 通过，且两 surface Cookie 隔离。
- [ ] 管理员创建账号、新账号登录和手机号登录通过。
- [ ] 多角色、无权限拒绝、Assignment 切换和调岗后旧权限失效通过。
- [ ] 密码重置后旧 Session 因 `securityRevision` 失效。
- [ ] API、Worker、PC、H5、数据库和 E2E 包测试通过。
- [ ] `pnpm compose:check`、`pnpm e2e:check`、`pnpm check` 通过。

## 非目标

MFA、自助找回、第三方登录、外部用户、邀请、微信小程序、JWT、动态策略编辑器、真实 CRM 领域模块和生产 SLA 均不在本次验收范围。
