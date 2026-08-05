# ADR-0031：PC 工作台实时推送与通知模板管理

- 状态：已接受
- 日期：2026-08-03
- 决策人：项目负责人
- 适用范围：`apps/api`、`apps/workbench-web`、`notifications`、`task-center`、PC BFF Session、RabbitMQ
- 扩展决策：ADR-0005、ADR-0010、ADR-0014、ADR-0017、ADR-0021、ADR-0026、ADR-0030

## 已知事实

- `workbench-web` 已有同源 HTTP-only BFF Session、Task/Notification HTTP 查询和五秒轮询。
- 通知中心已有不可变模板发布版本、受限 Mustache、变量 Schema、生成时渲染快照与受控 Deep Link。
- 首个生产拓扑是两个独立 API 实例；RabbitMQ 已是既定异步传输，HTTP 事实读取仍是恢复和补偿来源。
- 项目负责人确认首期只向 `workbench-web` 提供服务端实时推送，并确认管理员可配置通知标题、摘要和正文。

## 允许假设

- 首期系统显示时区固定为 `Asia/Shanghai`，公共时间变量格式固定为 `YYYY-MM-DD HH:mm:ss`。
- 固定 CRM 系统管理员均可管理已注册通知模板；登录安全策略仍只允许 ZSJ 系统管理员管理。
- 单个 BFF Session 默认最多建立八个标签页连接；连接总容量只有经过环境证据后才可配置并启用生产。

## 禁止的假设

- 不确认移动端、外部端、系统桌面通知、声音或任何外部渠道。
- 不推导 CRM 通知类型、收件人、业务触发、审批实体、任务状态、SLA 或路由。
- 通知模板不能创建模板键、变量数据提供方、Deep Link、脚本、查询、网络调用或授权规则。
- WebSocket 消息不能执行已读、审批、任务完成或其他业务命令，也不能成为事件重放事实源。

## 决策

### 1. 同源原生 WebSocket 与 HTTP 补偿

API HTTP Server 在 `/realtime` 接受 RFC 6455 Upgrade，子协议固定为 `ai-crm.realtime.v1`。握手必须校验 PC Origin allowlist、HTTP-only BFF Session、唯一 Workforce Person、有效 Employment 和 `crm.workbench.shell:read`。禁止 URL Token、查询票据、Keycloak Token和客户端自选身份。

WebSocket 只发送完整展示快照与刷新信号。首次连接和每次重连均先通过 HTTP 同步 Task、Notification 和未读数，再以 `connection.ready` 建立实时基线；服务端不保留供浏览器请求重放的消息历史。断线超过十五秒后，PC Web 启动三十秒降级轮询，恢复后立即停止。RabbitMQ 或实时消费者故障使实时健康状态 degraded，但不使 HTTP readiness 失败。

### 2. 每节点独立广播消费

每个 API 实例声明独立、exclusive、auto-delete 的 RabbitMQ 节点队列并绑定传输事件。所有节点收到广播后，只筛选并投递本节点连接；投递前重新校验 Session、人员状态与当前 Task/Notification 权限，再从拥有模块读取最新展示快照。传输事件只带稳定事实引用、目标 principal、状态版本与必要路由引用，不带正文、姓名或模板变量。

重复、乱序和旧版本消息被丢弃；消费或读取失败发送 `collection.resync-required`。浏览器投递失败不重试业务消息。单帧编码后上限 32 KiB；单连接待发送缓冲超过 256 KiB 时先要求重同步，再以 1013 关闭。服务端每二十秒 Ping，十秒无 Pong 关闭。WebSocket 压缩默认关闭。

### 3. PC Session 并发策略

PC Session v2 保存服务端确定的 `clientType=pc-web`，Redis 使用 HMAC subject index，不能暴露或按明文主体扫描。`crm.authentication.pc-session.concurrent-limit` 默认 1、范围 1–5；`crm.authentication.pc-session.revocation-target-seconds` 默认 5、范围 5–60。

新登录以原子操作登记并撤销最旧的超额同类 Session；新登录成功，旧 Session 失败关闭。策略降低后 HTTP 请求与活动 WebSocket 在目标时限内重新检查。撤销产生 Audit 与 Outbox 信号，RabbitMQ 故障时由周期检查兜底。Session v2 上线一次性失效旧版 PC Session，不扫描旧 Redis 数据。业务配置不能保存 Session Secret 或 HMAC Key。

### 4. 注册定义与管理员内容分离

拥有模块通过受保护系统端口注册 `NotificationTemplateDefinition`，包含稳定模板键、Owner、通知类型、定义版本、允许变量、变量目录版本、系统发送方名称和启用状态。管理员只能修改已注册定义的标题、摘要和正文草稿，不能创建通知类型或改变业务语义。

草稿用 revision 乐观并发。发布生成不可变版本并默认激活；激活历史追加记录，允许显式重新启用历史版本，仅影响未来通知。历史通知保留实际模板版本、内容摘要及最终渲染快照，不随模板、姓名、组织和时间格式改变。预览示例和内容不得持久化或进入日志、Trace、Audit。

### 5. Intent v2 与生成时变量解析

Intent v1 保留生产者显式指定 `templateVersion` 的重放兼容。Intent v2 只指定 `templateKey`，通知中心首次接受时解析当前激活版本。同一 `producer + idempotencyKey` 永远返回首次结果，模板切换不改变重放结果。

公共变量首期为 `owner`、`sender`、`time`。`owner` 是每个实际收件人的生成时姓名；`sender` 是稳定 Workforce Person 引用解析的发起人姓名，系统事件使用定义注册的系统发送方名称；`time` 来自通知权威 UTC `createdAt` 的上海时区固定格式。通知模块通过组合层提供的公共目录 Port 解析姓名，不查询 Organization 表。

按收件人校验变量 Schema 并渲染；任何必需变量缺失、歧义、越权、类型错误或超限使整个意图失败，不产生部分通知。不保存完整原始变量 Map；仅保存必要稳定引用、解析版本、模板版本和渲染快照。

### 6. 受限 Markdown 安全模型

标题与摘要是纯文本 Mustache；正文是受限 Markdown Mustache。Mustache 只接受 `{{variableName}}`，禁止 Helper、条件、循环、Partial、点路径、三花括号和原型链名称。正文 AST 只允许 root、段落、文本、换行、粗体、斜体、列表、列表项、引用和行内代码；拒绝链接、图片、标题、表格、代码块、分隔线和原始 HTML。

变量按字段上下文转义，正文变量不能注入 Markdown、链接或 HTML。前端用 React 节点渲染器和同一白名单，不用 `dangerouslySetInnerHTML`。整个 Toast 可点击且只有注册表 Deep Link 一个目标，正文不能生成第二链接。

### 7. Task 展示与编辑合并

`task-projection-lifecycle.v2` 增加来源提供的 `display.title` 和 `display.summary`；Task Center 兼容 v1 并用业务中立文案回退，不反向查询来源模块。通知模板不得改变 Task 事实。

业务页面使用 `serverSnapshot + localDraft + basedOnVersion`。实时刷新自动覆盖未编辑的服务端字段、保留用户输入；同字段双方变化形成冲突并默认禁止提交，用户确认新基准后才允许发出正式 HTTP 命令。首期只提供业务中立 Hook 和合成验收，不创建审批或 CRM 实体。

## 安全、观测与发布约束

- 模板读/写/发布/激活分别授权；普通员工不得读草稿、变量示例或历史。所有写操作具备 CSRF、Origin、Idempotency-Key、attempted/succeeded/failed Audit。
- 日志、Sentry、Trace、指标和健康响应不得记录模板/预览正文、变量值、姓名、通知正文、Cookie、Token、表单草稿或 RabbitMQ 原始载荷。
- 指标覆盖连接、拒绝、异常关闭、队列、端到端延迟、乱序丢弃、重同步、降级轮询、撤销延迟和模板操作失败。
- 95% 已提交事件五秒内形成客户端可见更新是验收目标，不是生产 SLA。
- 本地默认可启用；生产必须由 `AI_CRM_REALTIME_ENABLED` 显式开启，且 ADR-0029 的 G5 外部运维证据完成前禁止启用。

## 影响与取舍

- 两节点临时队列避免粘性会话和跨节点连接目录，但每个节点都承担一次事件鉴权与快照读取。
- HTTP 全量同步让断线恢复保持简单、可验证，但恢复时增加查询负载。
- 受限 Markdown 比纯文本表达更丰富，同时通过 AST/React 节点双白名单避免引入 HTML 清洗与任意导航面。
- 模板按收件人解析姓名会增加目录读取成本，但保证 `owner` 语义正确且历史可解释。

## 非目标与替换条件

本决策不建设移动端推送、外部渠道、任意通知编排、任务模板、富文本 HTML、Markdown 链接、自动模板回退或具体 CRM 通知类型。若生产连接容量、跨地域部署、移动端后台推送或重放需求发生变化，必须以容量证据和新 ADR 重新评审拓扑与协议。
