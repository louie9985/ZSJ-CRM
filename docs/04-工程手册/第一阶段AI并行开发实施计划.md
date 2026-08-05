# 第一阶段 AI 并行开发实施计划

- 状态：执行中
- 当前基线：ADR-0034
- 当前范围：公共技术底座、业务中立 walking skeleton、PC Web、内部 Taro H5

## 已知事实

- 认证已收敛为本地 Account/Access；浏览器 surface 只有 `pc` 与 `internal-h5`。
- `workforce-access`、`organization`、`authorization` 分别持有账号、组织、授权事实，禁止跨表查询。
- PostgreSQL、Redis、RabbitMQ、Flowable、ClamAV、Nginx 是当前本地依赖。
- 历史 migration 不可修改；本次身份切换使用空开发卷和追加 migration。

## 允许假设

- 当前没有必须保留的真实数据。
- 第一版密码为 8–64 位可打印半角 ASCII。
- 唯一本地初始管理员由受限密码文件 bootstrap。

## 禁止假设

- 不存在外部端、小程序、第三方登录、MFA、自助找回、邀请或非浏览器客户端。
- 不为未来 JWT、动态策略或 CRM 业务域预建代码、表、Secret 或端点。
- 不修改其他模块表，不传递 Prisma Client/transaction client 作为公共契约。

## 工作包

| 工作包 | 主要路径 | 交付 | 依赖 |
|---|---|---|---|
| IAM-01 本地账号凭证 | `packages/crm-modules/workforce-access` | Account、Credential、标识规范化、Argon2id、revision | DAT-01 |
| IAM-02 组织上下文 | `packages/crm-modules/organization` | Person、Employment、Assignment、有效期解析 | DAT-01 |
| IAM-03 固定授权 | `packages/crm-modules/authorization`、`contracts/permissions` | 三个固定角色、Permission catalog、allow/deny | IAM-02 |
| IAM-04 Account/Access 应用服务 | `apps/api/src/auth` | 两 surface HTTP、Redis Session、CSRF、限流、审计 | IAM-01～03 |
| IAM-05 账号管理 | `apps/api/src/workforce-administration` | 原子创建、禁用、调岗、离职、密码重置、幂等 | IAM-01～04 |
| CLI-01 PC Web | `apps/workbench-web` | 登录、Session、Assignment、注销与管理入口 | IAM-04 |
| CLI-02 员工移动入口 | `apps/workbench-web` | `/mobile/*` 响应式入口，与 PC 共用员工 Session | IAM-04 |
| DAT-01 数据库 | `packages/database`、模块 `migrations/` | 组合 Prisma、追加 migration、最小权限 | G0 |
| INF-01 本地/生产 Compose | `deploy/compose`、`deploy/nginx` | 六依赖拓扑、Secret、健康检查、两主机配置 | DAT-01 |
| E2E-01 验收 | `tests/e2e`、`scripts/check` | 空卷 bootstrap、两 surface、账号管理、授权失效、完整门禁 | 全部 |

## 路径所有权

每个工作包只修改其主要路径和必要契约/文档。跨包行为先改契约，再改实现。客户端只消费生成客户端或公开 HTTP 契约；领域模块只消费 `crm-sdk` 与正式契约。

## 合并门禁

1. 行为变更包含对应单元、集成或 E2E 测试。
2. 单独复核授权、幂等、事务、migration、可观测性和兼容性。
3. 密码、Cookie、请求体、个人信息和 Secret 不进入日志、审计或 Trace。
4. `pnpm repo:check`、`pnpm compose:check`、`pnpm contracts:check` 通过。
5. 空卷 migration 和两次 bootstrap 通过。
6. PC/H5 认证集成与完整 `pnpm check` 通过。

详细验收证据记录在[第一阶段 Walking Skeleton 验收清单](../06-质量验收/第一阶段Walking-Skeleton验收清单.md)。
