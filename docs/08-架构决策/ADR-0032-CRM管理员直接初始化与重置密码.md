# ADR-0032：CRM 管理员直接初始化与重置密码

- 状态：已接受
- 日期：2026-08-03
- 决策来源：当前产品请求
- 部分取代：ADR-0030 中“创建与重置密码只能使用 Keycloak Credential Ceremony”的选择

## 背景

员工账号管理已具备创建账号和重置密码入口，但原实现要求管理员跳转到 Keycloak 托管页面完成密码设置。当前产品要求管理员在 CRM 创建账号时直接输入初始密码，并在 CRM 重置密码时直接指定新密码。

## 决策

1. `create_account` 必须接收一次性的 `initialPassword`；`reset_password` 必须接收一次性的 `password`。
2. 密码只允许存在于当前 HTTPS 请求、BFF/API 进程内存和发往 Keycloak Admin API 的请求体中。CRM 数据库、操作收据、审计、日志、指标、Trace、Sentry、事件、后台 Job、响应和前端持久化均不得保存或回显密码。
3. Keycloak 继续拥有密码策略、凭证存储和认证事实。CRM 只执行有权限、带 CSRF、幂等键和 revision 的管理命令，不实现密码哈希或密码策略副本。
4. 创建流程先创建禁用的 Keycloak 用户，再设置非临时密码并启用该用户；Keycloak 成功后账号目录进入 `active`。
5. 重置仅允许 `active` 或 `credential_pending` 账号。新密码写入成功后撤销该用户的既有会话；`credential_pending` 账号随后进入 `active`。
6. Keycloak 拒绝密码策略时返回稳定的 `workforce_password_policy_violation`，不返回提供商消息或密码值；其他 `400` 不得误报为密码策略错误。Keycloak 不可用时失败关闭，并允许相同 Operation ID 和相同命令指纹安全重试。
7. 停用账号的恢复仍使用现有 Credential Ceremony，本决策不改变恢复流程。
8. 所有密码设置界面必须在输入区直接展示当前版本化 Realm 密码规则。Keycloak 拒绝密码时，CRM 使用弹出消息展示同一条可执行规则，不要求用户猜测；前端校验只用于即时反馈，不能取代 Keycloak 的最终校验。当前规则为 8-64 位可打印半角 ASCII 字符。

## 安全与运维影响

- BFF/API 的请求记录和异常处理必须继续禁止记录请求体。
- 密码设置调用保持同步且不进入 Outbox/RabbitMQ，因为后台 Job 载荷禁止包含凭证。
- 审计只记录操作人、目标账号、操作类型、Operation ID、结果和 Trace 引用，不记录密码或请求体。
- 密码复杂度、历史密码和其他策略由 Keycloak 配置与测试覆盖；CRM 和 Keycloak 主题展示并预检已版本化的可表达规则，配置一致性测试阻止各界面与 Realm 漂移。

## 非目标

- 不实现用户自行改密、忘记密码、短信或邮件找回。
- 不新增 CRM 密码表、密码哈希、默认密码或密码生成规则。
- 不改变 MFA、联合身份、登录会话和外部身份关联边界。
