# 契约索引清单（Contracts Manifest）V3.0

> 用途：渐进式披露的"地图"。本文件**不含契约细节**，只回答三件事：全系统有哪些契约、在哪个权威文件、需要详情去拉哪一段。
> 使用：Agent 拿到任务先读本清单定位相关契约单元，再只拉取对应权威文件的对应段，不得凭记忆编造（见《AI多Agent协作机制》第 6 章）。
> 变更：与契约本身同步，走 M11 工单 + 产品负责人审批，版本递增。

## 权威源约定

| 契约类型 | 权威源 | 说明 |
|---|---|---|
| 事件契约 | `事件契约表-V3.0.md` | 人工维护受控文档，模块间唯一交互契约 |
| API 契约 | OpenAPI spec（NestJS 装饰器自动生成） | 代码即契约，CI 产出 shared-core 类型 |

---

## 一、事件契约索引（权威文件：事件契约表-V3.0.md）

| 域 | 定位锚点 | 发布方 | 主要订阅方 | 典型事件 |
|---|---|---|---|---|
| lead | `### lead 域` | M4 / M5 | 调度 / M13 / P4-4 | lead.created / assigned / accepted / missed / first_contacted / qualified / invalidated / grabbed / sea.* / objection.* |
| order | `### order 域` | M5 / M8 / M4（创建）；M6/M7/M9（流转） | M6 / M7 / M9 / M2 / M13 / 调度 | order.created / enroll.approved / enroll.rejected / finance.confirmed / finance.rejected / fulfill.completed / refund.* / commission.* |
| student | `### student 域` | M7 / M8 | P4-4 / 调度 / M13 | student.enrolled / assigned / first_contacted / plan.completed / serviced / stage.changed / risk.* / seeding.progressed / repurchase.opportunity.created / class.changed / graduated |
| exam | `### exam 域` | 调度引擎（读 M3 日历） | M8 | exam.window.approaching / register.deadline.approaching |
| complaint/ticket | `### complaint / ticket 域` | M10 / M11 | 质控 / 各处理人 / M13 | complaint.created / resolved / ticket.created / completed |
| platform | `### 平台域` | P4-4 / P4-3 / P4-2 / P1 | 全局 | ownership.changed / person.merged / config.changed / assignment.closed |

**通用事件骨架**：`event_id / event_type / biz_ref_type / biz_ref_id / occurred_at / actor_id / payload(jsonb) / config_version`

---

## 二、API 契约索引（权威源：OpenAPI，按模块 tag 定位）

| 模块 | 路径前缀 | OpenAPI tag | 关键端点（定边界，全量以 OpenAPI 为准） |
|---|---|---|---|
| 通用 | `/auth` `/me` | auth / me | login/refresh/logout；`/me/permissions`；`/me/tasks` |
| M1 组织 | `/api/v1/org` | org | departments / employees / assignments；employees/{id}/resign |
| M2 客户 | `/api/v1/persons` | person | persons/{id}；supplement；duplicates；merge（Ownership 无公开写接口） |
| M3 产品 | `/api/v1/products` | catalog | products / class-batches / exam-batches |
| M4 客资 | `/api/v1/leads` | lead | 六入口录入 / 抢单 / 公海 / 异议 / 外部提交者管理 |
| M5 销售 | `/api/v1/sales` | sales | 接单 / 首触 / 跟进 / 有效判定 / 成交录单 |
| M6 订单 | `/api/v1/orders` | order | 订单 / 退款 / 佣金台账 |
| M7 履约 | `/api/v1/enroll` | enroll | 审核队列 / 审核 / 履约六项 / 分班交接 |
| M8 学服 | `/api/v1/students` | student | 学员 / 学习规划 / 服务记录 / 复购机会 / 缓考审批 |
| M9 财务 | `/api/v1/finance` | finance | 审核队列 / 审核 / 退款审核 / 佣金冻结释放台账 |
| M10 质控 | `/api/v1/qc` | qc | 投诉工单 / 质控评分 / 责任判定 / 抽检 |
| M11 工单 | `/api/v1/tickets` | ticket | 需求/Bug/规则变更/数据修正工单 |
| M12 工作台 | `/api/v1/workbench` | workbench | 各岗位今日待办（任务中心角色视图） |
| M13 大盘 | `/api/v1/dashboard` | dashboard | 漏斗 / 部门排行 / 产品排行 / 角色大盘 |
| 平台 | `/api/v1/{platform}` | platform | tasks / approvals / notifications / dicts / configs / imports / exports / attachments |

**错误码段**：1xxx 平台通用 / 4xxx M4 / 5xxx M5 / 6xxx M6 / 7xxx M7 / 9xxx M9 / 10xxx M10。

---

## 使用示例（开发 M4 客资中心）

```
1. 读本清单 → M4 相关：lead 域事件（发布）、ownership.changed（订阅）、M4 API tag=lead
2. 拉取权威段：事件契约表 ### lead 域 + ### 平台域(ownership.changed) 两段；M4 OpenAPI tag=lead
3. 发现"该订阅但切片里没有"的事件 → 据本清单主动补齐，或标 TBD 回组长
4. 不拉取无关域（order/student/exam 等），保持上下文聚焦
```
