# ADR-0033：CRM 单项目默认访问与统一工作台外壳

- 状态：已由 CRM 单项目结构方案取代
- 日期：2026-08-04
- 适用范围：仅本地开发验证
- 扩展：ADR-0030

## 背景与边界

CRM 管理入口已经创建 Workforce Person、Employment、Assignment、账号目录和 Keycloak 身份，但普通账号没有稳定的 CRM 基础访问 Grant。PC Web 已有双列外壳，却仍由客户端无条件显示 CRM，公共菜单也未全部与服务端授权导航求交集。

已知事实是账号创建具有部门、岗位和 Assignment，应用注册表可按 Permission 过滤，PC Web 具有唯一 `WorkbenchShell`。允许假设仅限首版普通 CRM 账号恰有一个有效 Assignment，Workspace binding 使用稳定部门和岗位 ID。不得把岗位名称、账号状态、Keycloak Role/Group 或前端菜单解释为授权事实。

## 决策

1. Authorization Policy v2 声明 `crm.application:access`，并声明固定角色 `crm.application-user`。该角色只包含 `crm.application:access` 与 `crm.workbench.shell:read`；Role Grant 只绑定 Assignment。
2. 创建账号按组织与账号事实、禁用 Keycloak 身份、基础 Grant、设置密码并启用 Keycloak、账号 `active` 的顺序执行。基础 Grant 发布失败时 Keycloak 保持禁用，账号不得进入 CRM；相同 Operation ID 继续由耐久操作收据和下游幂等键收敛。
3. 调岗先关闭旧 Assignment 并创建新 Assignment，再用一次不可变策略发布关闭旧基础 Grant并建立新 Grant。旧 Assignment 关闭后旧 Grant立即不适用；发布失败不回退旧岗位。
4. 停用先关闭本地账号、Assignment 和 Employment，使授权立即失败，再关闭基础 Grant并提交耐久 Keycloak 禁用。恢复先建立新 Employment、Assignment 与基础 Grant，凭证恢复成功后才进入 `active`。
5. `crm.system-administrator` Grant 与基础 Grant独立；撤销管理员 Grant不关闭基础访问。首版不提供单独撤销基础访问的命令。
6. 受控补授予任务分页读取全部 `active` 账号，发布前验证普通账号各有且仅有一个有效 Assignment。存在零或多个 Assignment 时整体失败且只返回稳定账号 ID；无 Assignment 的 ZSJ 系统管理员排除。预检通过后一次发布全部缺失 Grant，并以当前策略版本作为并发前置条件。
7. CRM 是唯一项目和唯一 Web 应用。`GET /workbench/bootstrap` 只返回当前 CRM 工作台的 `navigationIds` 与可选 `workspaceProfileId`，不返回应用目录字段。
8. 多个有效 Assignment 时失败关闭并返回 403，不选择第一个。工作台以 `applicationId + organizationUnitId + positionId` 解析 profile；无绑定或浏览器未知 profile 一律降级到 `crm.workspace.unconfigured`。
9. 服务端 Workspace binding/profile 与浏览器内容组件均使用代码注册。重复 binding、重复 profile、非法 ID 或未知 profile 引用在应用启动时失败。首版只注册中性空工作台，不创建真实岗位页面、配置管理界面或页面搭建器。
10. PC Web 只保留一个 `WorkbenchShell`。岗位内容只能注册内容组件与工作台二级导航，不能复制 Sider、Header、账号菜单、一级导航或布局样式。一级分类固定为工作台、日历、审批、通知、邮件、设置；公共二级项来自统一代码目录并与服务端 `navigationIds` 求交集，空分类隐藏。设置只承载所有岗位通用的设置能力；经服务端授权的岗位或管理员专属工具进入工作台二级导航。`crm.workforce-administration` 因此属于系统管理员工作台，不属于设置。
11. 登录成功直接进入 `/crm/workspace`。PC 与员工移动页面属于同一个 CRM Web 应用，分别使用 `/crm/*` 与 `/mobile/*` 路由；兼职入口使用独立身份域的 `/part-time/*` 路由。不存在应用选择页、应用切换菜单或多应用目录。
12. Audit、日志与 Trace 只允许稳定账号、Assignment、Grant、profile、Operation 和策略版本引用，不记录姓名、部门/岗位名称、密码、Cookie、Token或请求体。

## 失败、兼容与回退

- 策略不可用、并发版本冲突、Workspace 注册冲突和组织上下文歧义全部失败关闭。
- Policy v2 仍以追加不可变快照升级，不修改历史策略；应用注册沿用现有幂等 Operation ID。
- OpenAPI 新字段为可选，以允许旧客户端滚动升级；当前浏览器缺失字段时不凭空显示 CRM，未知 profile 只显示中性空状态。
- 回退采用前向策略发布与代码回滚，不删除已经发布的 Grant 历史。

## 非目标

不建设真实 CRM 岗位页面、岗位工作台管理 UI、可视化搭建器、多 Assignment 选择器、单独基础访问撤销、跨应用管理员框架或非本地部署。本变更不声称 G5、生产发布、自动故障转移或真实岗位工作台完成。
