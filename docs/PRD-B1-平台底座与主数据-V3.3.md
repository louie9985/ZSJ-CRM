# PRD-B1 平台底座与主数据（W1-W2）

> 对应总纲：第2章平台七组 P1~P7 + 第3章 M1/M2/M3
> 版本：V3.3 | 状态：待评审 | 验收人：产品负责人（平台）+ 人力（M1）+ 新媒体负责人（M2判重）
> 出口标准（B1完成的定义）：能建员工、配角色、录一个Person、发一条通知、生成一个任务、**企微工作台打开 H5 免密登录**〔CR-11：原「App壳装到真机」〕

---

## 1. 数据模型（核心表）

> 命名规范见开发手册；所有表含统一审计字段 `created_at/created_by/updated_at/updated_by/deleted_at`（软删除）。金额一律 `*_cents` 整数分（AP-19）。

### 1.1 身份与组织（M1 / P1）

**account 账号**
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | |
| type | enum | employee / external（外部提交者：兼职=轻创） |
| phone | varchar 加密存储 | 登录名 |
| password_hash | varchar | argon2 |
| status | enum | active / disabled |
| last_login_at / last_login_device | | 多端会话另有 session 表 |

> **〔V3.2/CR-11〕第三方登录绑定**：账号密码为唯一根身份，企微 userid（内部）/ 微信 openid（外部）为可选绑定快捷入口，只挂「账号」层（AP-01）。企微 userid 只存下方 `account_oauth_binding`，account **不再内联 `wecom_userid` 字段**（DEC-1，原字段废弃，迁移分两步发、存量数据迁入绑定表）。**首次触达**：弹授权拿 external_id → 查绑定 → 未绑引导账号密码登录一次完成绑定（凭服务端签发的一次性短 TTL `bind_ticket`，external_id 只认 ticket、不信前端传参，AP-03）→ 之后免密。〔M11-CR11 设计已定稿 2026-07-08〕

**account_oauth_binding 第三方登录绑定**〔V3.3/CR-11/M11〕
| 字段 | 类型 | 约束 / 说明 |
|---|---|---|
| id | uuid | PK |
| account_id | uuid | FK → account.id，NOT NULL |
| provider | enum | wecom / wechat，NOT NULL |
| external_id_enc | varchar | 应用层加密：企微=userid、微信=openid（DEC-2，AP-14） |
| external_id_hash | char(64) | sha256(provider+external_id)，用于唯一约束与等值查询 |
| union_id_enc | varchar null | 微信 unionid（加密），企微为 null（DEC-4，跨应用识别锚点） |
| status | enum | active / unbound，NOT NULL |
| bound_at | timestamptz | 绑定时间 |
| bound_source | enum | first_login / user / admin（绑定来源，审计用） |
| unbound_at / unbound_by | timestamptz null / uuid null | 解绑软删留痕（DEC-3：本人自助或管理员代解，均写审计） |

唯一约束（防串号，红类关键）：
- `UNIQUE (external_id_hash) WHERE status='active'`：一个企微 userid / 微信 openid 全局至多绑一个平台账号。
- `UNIQUE (account_id, provider) WHERE status='active'`：一账号同一 provider 至多一个生效绑定（一账号至多绑一个第三方）。
- external_id 加密存储、日志不落明文（AP-14）；绑定/解绑写审计（AP-12）；登录/绑定写操作支持 X-Request-Id 幂等（AP-18）。详见《M11-工单-CR11-第三方登录绑定与免密》§3/§6。

**session 会话**（多端）：id, account_id, device, refresh_token_ref, expires_at, created_at。**〔V3.1/CR-09〕补 `active_assignment_id`**（当前活动任职）：多任职切换用，不进 JWT、存服务端会话（与「权限现算」一致）。单任职者登录自动设为唯一 assignment（无感）；多任职者切换=更新此字段，服务端校验该 assignment 属本人且生效（AP-03）并写审计。

**employee 员工档案**
| 字段 | 说明 |
|---|---|
| id, account_id | 1:1 |
| name, department_id, position | |
| hr_status | enum: 在职/试用/离职 |
| joined_at, left_at | |

**assignment 业务任职**（本系统最重要的表之一）
| 字段 | 说明 |
|---|---|
| id, employee_id | |
| role_code | enum: sales / sales_leader / media_op / partner_op / enroll / finance / planner / academic_support / delivery_leader / qc / hr / admin / boss |
| scope_type | none / group / department / class_batch |
| scope_id | 对应组/部门/班种id |
| start_at, end_at | end_at 为空=生效中 |
| end_reason | 转岗/离职/班期结束/调整 |

约束：
- 业绩/服务归属判定一律 `where start_at <= 事件时间 < coalesce(end_at, 'infinity')`（AP-06）
- 关闭 assignment 不删除，只写 end_at
- 同一 employee 可多条并行（一人多岗）

**department 部门**：id, parent_id, name, type(department/group), leader_employee_id, path(物化路径)。

**role_permission 功能权限**：role_code → menu_key / button_key / api_pattern 三级。
**role_data_scope 数据范围**：role_code × resource(lead/order/student/...) × scope。**〔V3.1/CR-08〕scope 取值 = `SELF` / `ORG_SUBTREE` / `CUSTOM` / `ALL`**（原 self/group/dept/all 已修订）：ORG_SUBTREE 用 `department.path` 物化路径前缀匹配表达「本节点及所有下级」，统一组/部门层级；ALL 跨全树；CUSTOM 见下方 `data_scope_grant`。查询层拦截器统一注入，业务代码禁止手写scope条件（AP-02）。即便 ALL，敏感字段仍走 AP-14 单独鉴权+访问审计。

**〔V3.1/CR-09〕data_scope_grant 额外数据域授权**（CUSTOM 落地，长期/特例）：id, `assignment_id`（授给任职身份而非人）, resource, scope_type(org_subtree/specific), scope_ref(department_id或数据域id), granted_by, reason, start_at, end_at（支持永久或带期限）。补 `role_data_scope` 只能按角色配、无法表达「某人额外可见某区域」的缺口。

**〔V3.1/CR-09〕temp_access_request 临时授权**（JIT，必经审批+TTL）：id, requester_assignment_id, resource, scope_ref, reason, `approval_instance_id`（复用既有审批链）, status(pending/approved/rejected/expired/revoked), granted_at, `expires_at`（到期由定时任务扫描回收，AP-11）, revoked_at, revoked_by。全程写 audit_log（AP-12）+ 发事件（AP-21）。可一期只建模型、暂缓完整实现。

### 1.2 客户主数据（M2 / P1-6 / P4-3 / P4-4）

**person 主档案**
| 字段 | 说明 |
|---|---|
| id | |
| name_or_alias | 姓名/称呼 |
| phone_primary | 加密+哈希索引列（判重用 phone_hash） |
| wechat, wecom_external_id | |
| city, age_range, education, occupation | 分阶段补充 |
| merged_into_person_id | 非空=已被合并（原记录保留只读） |
| profile_completeness | 档案完整度%（按阶段必填字段计算，MT-37） |

**identity 业务身份**：person_id × type(lead/customer/student/partner/talent预留/tutor预留) × status × created_at。一人多条。

**ownership 归属**
| 字段 | 说明 |
|---|---|
| id, person_id | |
| type | lead_owner（客资归属）/ service_owner（学员服务归属） |
| owner_employee_id | |
| start_at, end_at | |
| change_reason | enum: assign自动分配 / manual手动 / grab抢单 / sea_in进公海 / awaken唤醒 / transfer交接 / class_change转班 / resign_release离职释放 |
| operator_id, prev_ownership_id | 链式可追溯 |

**铁律**：所有归属读写只经 OwnershipService；任何业务模块直接 update 负责人字段的代码，评审打回（总纲P4-4）。

**判重服务（P4-3）**：
- 归一化：手机号去空格/去+86/全角转半角；虚拟号段打标不拒绝
- 判重键优先级：phone_hash > wecom_external_id > wechat
- 命中处理：精确命中→自动挂接已有person并按BR-A03归属首次提交人+发再激活提醒；模糊命中（仅wechat同）→进"疑似重复"人工队列
- 合并：管理员操作，保留合并前双方快照，事件 `person.merged`

### 1.3 产品目录（M3）

**product_sku**：id, name, category(考证/学历/技能实操/就业/畅学卡/轻创/企业预留), standard_price_cents, min_price_cents, discount_permission(哪级角色可批), service_months, study_months_default, status(上架/下架), cost_* 字段预留（考试费/教材费/导师费，V1可空）。

**exam_batch 考试批次**：id, product_id, name(如"公共营养师2026年9月批"), exam_date, register_deadline, sprint_start(默认exam_date-30d，可改)。

**class_batch 班种**：id, product_id, exam_batch_id, name, study_start, study_end, service_end, capacity, status(筹备/开班/结班)。规划师带班=assignment(role=planner, scope_type=class_batch)。

### 1.4 平台公共表（P2~P6）

| 表 | 关键字段 |
|---|---|
| task 任务 | id, type, title, assignee_employee_id, biz_ref_type+biz_ref_id, due_at, priority, status(pending/done/expired/cancelled), source(rule/approval/manual/supervisor), rule_key(哪条规则生成) |
| approval_flow_def 审批链定义 | flow_key, 节点数组[{step, approver_type(role/user/direct_leader), approver_ref, condition表达式}], version, status。L3表单式配置界面维护 |
| approval_instance / approval_record | 实例+每节点记录（通过/驳回/补正，意见，时间） |
| event_store 事件表 | event_id, event_type, biz_ref, occurred_at, actor_id, payload jsonb, config_version（AP-20）, created_at；消费位点表 event_cursor(consumer, last_event_id) |
| notification | id, recipient, template_key, channel(inapp/wecom_app_msg/sms), biz_ref, dedup_key, status(sent/read), sent_at。**〔V3.2/CR-11〕生成与外部推送分离：inapp 必生成（事实源），wecom_app_msg=内部企微应用消息（best-effort），外部端只 inapp；原 `push`(App推送)通道废弃** |
| notify_template | template_key, channel, title_tpl, body_tpl, version（L3可配） |
| alert 预警 | id, rule_key, level, target_ref, subscribers, status(open/claimed/resolved), claimed_by, resolved_at |
| dict_type / dict_item | 字典：客资来源/等级/无效原因/退款原因/投诉类型/丢单原因… item含 sort/status/ext jsonb |
| config_param | key, value, value_type, version, effective_at；config_change_log(前后值/操作人/时间) |
| audit_log | actor, action, resource, before/after jsonb, ip；ORM中间件自动写（AP-12） |
| timeline_entry | person_id/biz_ref, entry_type(跟进/状态/审批/补充/归属), content, actor, occurred_at |
| import_job / export_job | 文件、映射、校验结果、错误报告；export含敏感标记+审批状态 |
| attachment | id, biz_ref, oss_key, visibility_scope, uploaded_by；下载走鉴权接口（AP-13） |
| work_calendar | 班次定义（报名服务 7:30-15:30 / 15:30-22:30）、节假日；SLA计时引擎引用 |

**调度引擎（P2-4）实现**：**〔V3.1/CR-01〕RabbitMQ 延时/延迟消息**（2分钟接单/10分钟首触/7日解冻）+ 每分钟周期扫描（90日公海/考前N天，幂等：扫描以状态为准不以调度记录为准，AP-11）。所有 job 带锁与去重键。（原 BullMQ 已随 CR-01 改为 RabbitMQ；Redis 仍可用于分布式锁）

---

## 2. API 概要（按模块前缀）

> 全量以 OpenAPI 为准（CI自动生成，AP-15）。此处列关键端点定边界。

```
POST /auth/login | /auth/refresh | POST /auth/logout        双端+外部端(Taro)共用（账号密码）
# 〔V3.3/CR-11/M11 已定稿〕第三方免密登录与绑定（写操作支持 X-Request-Id；external_id 只认服务端 bind_ticket）
POST /auth/wecom/login | /auth/wechat/login    {code}→已绑{access,refresh} / 未绑{need_bind,bind_ticket}
POST /auth/login {phone,password,bind_ticket?}  账号密码登录；带 bind_ticket 则登录成功后完成首次绑定
POST /auth/bind/wecom | /auth/bind/wechat       需登录态，主动绑定
DEL  /auth/bind/wecom | /auth/bind/wechat       解绑（本人或管理员，DEC-3；写审计）
GET  /me/permissions                                        前端菜单/按钮渲染依据（AP-03后端仍强制校验）
GET  /me/tasks?date=today&status=pending                    今日待办（M12的数据源）

# M1
CRUD /org/departments /org/employees /org/assignments
POST /org/employees/{id}/resign                             离职向导：停Account+关Assignment+触发客户转移

# M2
GET  /persons/{id}                                          按角色返回脱敏视图
POST /persons/{id}/supplement                               信息补充（留痕）
GET  /persons/duplicates  POST /persons/merge               疑似重复队列/合并
# Ownership 无公开写接口——只被业务服务内部调用

# M3
CRUD /products /class-batches /exam-batches

# 平台
POST /tasks  PATCH /tasks/{id}/done
POST /approvals/{flowKey}/start  POST /approvals/{id}/approve|reject|supplement
GET  /notifications  PATCH /notifications/{id}/read
CRUD /dicts /configs（configs写走审批或双人确认，留痕）
POST /imports  GET /imports/{id}/report
POST /exports（敏感字段→自动进审批）
POST /attachments/presign  GET /attachments/{id}/download   下载鉴权
```

---

## 3. 验收用例（AC）

| # | 用例 | 通过标准 |
|---|---|---|
| AC-B1-01 | 建部门树+销售组，建员工，赋角色 | 登录后菜单按角色渲染；越权API调用返回403（改前端绕过无效） |
| AC-B1-02 | 同一员工加两条并行Assignment（规划师+学务支持） | 两种角色待办都出现在其今日待办 |
| AC-B1-03 | 员工离职向导 | Account立即不可登录；Assignment关闭；名下Ownership进入待转移队列；审计日志3条齐全 |
| AC-B1-04 | 录入两条同手机号（一条+86前缀带空格）Person | 第二条精确命中判重，挂接同一Person，发再激活提醒 |
| AC-B1-05 | 数据范围验证 | 销售A查客户列表只见本人；组长见本组；用A的token直接调B的客户详情API→403 |
| AC-B1-06 | 脱敏验证 | 销售看手机号掩码；点"查看完整"（有权限）→显示并写访问审计；无权限角色无此按钮且API拒绝 |
| AC-B1-07 | 配置修改 | 后台把 lead.accept.timeout 从2分钟改3分钟→留痕；新客资按3分钟倒计时；改动前创建的事件仍记录旧config_version |
| AC-B1-08 | 通知链路 | 触发一条模板通知→**站内必生成 + 内部企微应用消息 best-effort 送达**〔CR-11〕；重复触发同dedup_key不重发 |
| AC-B1-09 | 任务超时 | 手工建一个5分钟到期任务不处理→状态expired→升级通知其主管 |
| AC-B1-10 | 企微 H5 入口〔CR-11〕 | 企微工作台打开内嵌 H5→企微 OAuth 免密登录（未绑则账号密码登录一次完成绑定）；账号密码直登亦可；版本号显示 |
| AC-B1-11 | 审计与时间线 | 修改Person城市字段→audit_log含前后值；Person时间线出现"信息补充"条目 |
| AC-B1-12 | 导入底座 | 上传错误模板→行级错误报告可下载；正确模板→judged判重后入库，重复行标记 |

---

## 4. 边界与不做

- 本批次不实现任何客资/订单业务逻辑（B2/B3）；只保证平台能力可被调用
- **〔V3.2/CR-11〕企微集成范围调整**：内部端为企微工作台 H5，故 B1 需打通**企微 OAuth 免密登录**（拿 userid）与**企微应用消息推送**（`WecomPushService`，platform/集成网关）。其余企微深度能力（通讯录同步等）仍不做，只留字段与适配器接口。
- L3配置界面本批次先做：参数中心+字典管理；审批链/通知模板配置界面允许滑到B4收尾（但数据表结构本批次定死）
- 佣金台账表结构在B3建，但 `commission.freeze.days` 参数键本批次入库

---

## Changelog

| 版本 | 日期 | 变更 |
|---|---|---|
| V3.0 | 2026-07-07 | 初版 |
| V3.1 | 2026-07-08 | 技术选型评审（M11 放行）回写：**CR-08** role_data_scope.scope → SELF/ORG_SUBTREE/CUSTOM/ALL；**CR-09** 新增 data_scope_grant、temp_access_request，session 补 active_assignment_id；**CR-01** 调度引擎 BullMQ → RabbitMQ。详见《技术选型-V3.2》。 |
| V3.2 | 2026-07-08 | **CR-11** 移动端由 App 改小程序/H5 回写：出口标准/AC-B1-08/10 由 App 改企微 H5；notification.channel 去 push、改 inapp/wecom_app_msg/sms 并注「生成/推送分离」；第4章企微集成范围调整（B1 需 OAuth 免密+应用消息）。**新增待办（须开 M11 定稿）**：①`account_oauth_binding` 第三方绑定表结构；②企微/微信登录绑定 API 端点。详见《技术选型》第 9 章。 |
| V3.3 | 2026-07-08 | **M11-CR11 定稿回写**：§1.1 account 注下补入 `account_oauth_binding` 第三方绑定表（字段/唯一约束/防串号/DEC-1~4 落地），account 去内联 `wecom_userid`；§2 API 概要补企微/微信免密登录与绑定端点（`/auth/wecom\|wechat/login`、`/auth/login` 带 bind_ticket、`/auth/bind/*`）。清理 V3.2 登记的两项 M11 待办。详见《M11-工单-CR11-第三方登录绑定与免密》§3/§4/§6。 |
