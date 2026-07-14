# CLAUDE.md — AI-CRM V3.0 项目宪法与工程规范

> 本文件注入每一个 AI 会话与子 Agent 的上下文。开工前必读。
> 事实源：`docs/AI-CRM-V3-产品需求与开发总纲-V3.4.md`、`docs/开发手册细则-V3.2.md`、`docs/事件契约表-V3.0.md`。规则以这三份受控文档最新版为准，本文件是其精炼索引。

## 0. 最高约束：架构宪法（AP-01~21）

违反任一条 = 代码评审直接打回。审查时逐条打勾。

**身份与权限**
- AP-01 账号/操作人/员工档案/业务任职分开建模，不允许 God-User
- AP-02 数据范围权限与功能权限分离
- AP-03 前端隐藏/灰按钮不能代替后端鉴权

**状态与历史**
- AP-04 核心状态/金额/权益/审核/归属由后端判断
- AP-05 待办、通知、业务状态分开
- AP-06 历史依赖快照与事件，不用当前人员/配置反推过去

**流程与一致性**
- AP-07 关键动作有前置/互斥/终态保护，防重复提交/关闭/结算/状态回退
- AP-08 中间态不等同最终归属/结果
- AP-09 金额/订单/权益/提现有一致性校验、去重、可追溯

**通知任务审计**
- AP-10 通知由稳定业务事件驱动，有触发时机/收件人/关联对象/去重；**生成与外部推送分离：生成必发生（站内事实源），外部推送按端能力增强（内部企微应用消息=可靠/外部只站内），推送失败不影响生成〔CR-11〕**
- AP-11 定时任务幂等、可重试、有锁、去重
- AP-12 关键动作/资金/权限/状态/敏感访问写审计日志；不记录密码/Token

**附件与敏感**
- AP-13 附件统一管理上传状态/业务关联/可见范围/下载鉴权
- AP-14 敏感信息最小化展示、按需查看、单独鉴权、访问审计

**接口与前端**
- AP-15 接口字段/状态/权限/金额口径变化同步更新文档/类型/测试/业务文档
- AP-16 前端不长期依赖 mock/静态假数据/本地硬编码业务规则
- AP-17 页面筛选/深链/抽屉/临时状态可恢复、可清理

**补充**
- AP-18 所有写操作 API 支持客户端幂等键（X-Request-Id）
- AP-19 金额一律整数分存储与计算，禁浮点
- AP-20 配置也是数据：变更留痕带版本；业务快照记生效配置版本
- AP-21 事件是唯一事实源：指标/通知/待办全由事件驱动，不跨模块直读表

## 1. 仓库结构（禁止技术层横切，按业务模块纵切）

```
packages/shared-core   # API client(OpenAPI生成)、类型、Zustand、hooks、权限判断、zod校验
packages/web           # React19 + HeroUI Pro（CollectUI）+ Tailwind CSS 4，只写视图
packages/mobile        # 内部移动端（企微工作台 H5，Taro+NutUI-React），只写视图
packages/h5-partner    # 外部提交端（Taro，出 H5+微信小程序）
apps/server            # NestJS，platform/ + modules/m1~m13
docs/                  # 受控文档
tools/                 # 造数脚本、迁移
```

**边界铁律（ESLint boundary + CI 拦截）**：
- `platform/**` 禁止 import `modules/**`
- `modules/mX` 禁止 import `modules/mY`（跨模块只走事件或 platform 服务）
- 跨模块只存 ID，禁止跨模块外键 JOIN 写业务逻辑
- `web/mobile/h5` 禁止写业务逻辑，逻辑一律下沉 shared-core

## 2. 后端规范要点

- REST `/api/v1/<module>/...`；统一响应 `{code,message,data,trace_id}`；错误码 `<模块号><3位>`
- 写操作接受 `X-Request-Id` 幂等键，服务端 (幂等键+端点) 去重
- 状态流转唯一入口 `StateMachineService.transition(...)`；业务代码直接 update status = 打回
- 归属读写只经 `OwnershipService`；直接 update 负责人字段 = 打回
- 抢单/接单用乐观锁 `UPDATE ... WHERE status='pending' AND owner IS NULL`，影响 0 行返回业务错误码
- 事件：业务事务内写 event_store（同库同事务），提交后 dispatcher 投递；消费端幂等（event_id 去重）
- 金额全链路整数分；佣金台账只增不改（状态迁移=新增流水行）；分账余数规则写死进单测（大头给成交人）
- Prisma Migrate；**迁移脚本禁止 AI 直接生成后合入，必须人工评审**
- 敏感列应用层加密 + hash 列做等值查询/判重

## 3. 前端规范要点

- 权限读 `/me/permissions`；任何本地硬编码角色判断 = 打回
- 服务端状态用 TanStack Query，缓存键 `[module, resource, params]`
- zod schema 在 shared-core，Web/移动端 + 后端共用（single source）
- 列表/详情用 P7-2/P7-3 统一组件，禁止每页手搓
- 筛选条件进 URL query（Web）/路由参数（移动端 Taro），刷新/返回可恢复
- 移动端（内部企微 H5 / 外部小程序+H5）统一 Taro + NutUI-React + Tailwind token + Lucide；登录账号密码为根 + 企微/微信绑定快进〔CR-11〕
- 禁止 mock 长存；确需 mock 标 `// MOCK-TODO(工单号)`

## 4. AI 编码纪律（红绿分级）

**绿类**（UI 布局、DTO、样板 CRUD、测试脚手架）：审查走查 + CI 门禁即可。

**红类**（金额/佣金、Ownership、状态机、权限、审批、迁移脚本、定时任务）：
- 测试先行（人写断言 AC，AI 补实现）
- 审查员逐行 + 找 bug 员对抗 + **人逐行放行**
- 单测覆盖率 ≥90%；分账余数、终态保护、时区/夜间 SLA 必有用例

**通用**：
- 提示词中禁用真实客户数据（敏感字段见总纲附录 B），造数用 `tools/seed`
- 跨模块边界改动（新增事件/改 platform 接口）先开 M11 工单获批再生成代码
- 每模块完成跑一次 AI 自审：宪法条款作检查清单逐条自查输出报告，人复核

## 5. 时区与日界线

服务器/DB 统一 UTC 存储，展示按 Asia/Shanghai；"当日下班前""90 日"等业务日界线按 Asia/Shanghai 计算（写进公共 dateutil，禁止业务代码自算）。

## 6. 提交与门禁

- trunk-based，短生命 feature 分支（<2 天）
- PR 门禁：lint + tsc + 单测 + boundary 检查全绿 + 1 名人工评审
- commit：`feat(m4): xxx` / `fix(platform/task): xxx`，关联工单号
- 围栏期 2026-08-18 起只修不加

## 7. 多 Agent 协作

角色定义见 `agents/`。组长编排，产品经理拆 AC，架构师守边界，实现者写代码，审查员挑问题，找 bug 员对抗。红类产出汇总后人放行。详见 `docs/AI多Agent协作机制-V1.0.md`。

## 8. 接口契约披露

存储单一源、披露渐进式：事件契约以 `docs/事件契约表` 为准，API 契约以 OpenAPI 生成类型为准，两者都不拆散不复制。Agent 按 `docs/contracts-manifest.md`（契约索引清单）定位并只拉取本模块相关切片，不凭记忆编造字段/事件；缺失标 TBD。新增事件/改字段先开 M11 工单。详见《AI多Agent协作机制》第 6 章。
