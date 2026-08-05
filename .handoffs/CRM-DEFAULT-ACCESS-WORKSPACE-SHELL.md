# CRM 默认访问与统一工作台外壳交接

## 已知事实

- 普通账号由 CRM 管理入口创建 Workforce Person、Employment、Assignment、账号目录和 Keycloak 身份。
- `crm.application-user` 只授予 `crm.application:access` 与 `crm.workbench.shell:read`，Grant 绑定 Assignment。
- `/workbench/bootstrap` 当前返回 `applicationIds`、`workspaceProfileId` 和服务端授权的 `navigationIds`。
- 首版唯一 profile 为 `crm.workspace.unconfigured`，没有真实岗位页面。

## 允许假设

- 本地开发普通 CRM 账号只有一个有效 Assignment。
- Workspace binding 只使用稳定 application、organization unit、position 和 profile ID。

## 禁止假设

- 岗位等于授权角色，账号 active 等于已授权，或菜单隐藏可以替代服务端授权。
- Demo/访谈中的岗位页面、字段或流程已经确认。

## 非目标

- 多 Assignment 选择器、岗位配置 UI、页面搭建器、单独撤销基础访问、真实 CRM 业务页面和非本地部署。

## Review 重点

- 授权与 Assignment 适用性、Operation ID 幂等、策略 expectedPreviousVersion 并发、跨系统顺序、补授予整体预检、日志数据最小化、OpenAPI 可选字段兼容和唯一 WorkbenchShell。

## 最终验证

- 独立 Review 已覆盖授权、Assignment 迁移、跨系统失败关闭、Operation 并发串行、补授予预检/幂等/策略版本冲突、兼容字段和唯一 Shell。
- `pnpm local:bootstrap` 首次应用后再次执行为 `replayed; created=0; existing=12`。
- `pnpm check` 通过，139/139 个任务成功。
- 浏览器验证覆盖 1366x768、1440x900、1920x1080、390x844，以及导航折叠、空工作台和 403 状态；未发现横向溢出或布局重叠。
- `/auth/pc/login` 和 `/auth/pc/callback` 未改名或迁移；本地登录仍使用原 callback URI。

## 未决假设

- 无。当前结果仅用于已批准的本地开发范围，不构成 G5、生产部署或真实岗位工作台完成声明。
