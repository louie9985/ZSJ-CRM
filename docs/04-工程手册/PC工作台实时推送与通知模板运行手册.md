# PC 工作台实时推送与通知模板运行手册

## 范围

本手册只覆盖 `workbench-web` 的 `/realtime` WebSocket、通知模板管理和 PC Session 策略。实时消息是展示快照或刷新信号，不执行审批、任务完成、已读或其他业务命令。生产启用仍受 G5 外部运维证据约束。

## 配置与 Secret

- `AI_CRM_REALTIME_ENABLED` 必须显式设置；未完成生产证据时保持 `false`。
- `AI_CRM_REALTIME_RABBIT_URL_FILE` 指向只读 Secret 文件，值必须使用 `amqps:`。
- realtime RabbitMQ 账号只能检查事件 Exchange，并声明、绑定、消费本节点的 exclusive/auto-delete 队列。
- PC Session 并发上限和撤销目标时间存放于版本化业务配置，不属于 Secret。默认分别为 `1` 和 `5` 秒。

## 故障行为

- RabbitMQ 或节点消费失败时 API HTTP 继续可用，readiness 中 realtime 依赖显示 degraded。
- 消费器按 1、2、4、8 秒递增并最多 30 秒重连；每次重连创建新的节点临时队列，不重放断线期间消息。
- 浏览器断线超过 15 秒后每 30 秒执行 HTTP 同步；连接恢复后先完成 HTTP 同步，再停止轮询。
- 慢客户端超过 256 KiB 发送缓冲时收到重同步要求，并以 1013 关闭。
- 活动 WebSocket 每 5 秒复核 Session、人员、Employment 和权限。失效 Session 以统一撤销消息关闭。

## 模板安全

- 管理员只能编辑已注册模板内容并插入该模板允许的变量，不能配置 URL、收件人、触发条件或业务命令。
- 标题和摘要为纯文本；正文只允许段落、换行、粗体、斜体、列表、引用和行内代码。
- 预览正文和示例变量不得写入日志、Trace、Audit 或数据库。
- 发布与重新启用只影响未来通知。历史通知继续使用生成时快照。

## 排障与恢复

1. 检查 API health 中 `realtime-rabbit-consumer`，不得记录连接 URL 或消息载荷。
2. 检查 RabbitMQ 是否存在各 API 节点的临时队列及三条绑定；节点退出后队列应自动删除。
3. 确认 Nginx `/realtime` 使用 HTTP/1.1 并传递 Upgrade/Connection Header。
4. 浏览器应在实时故障 15 秒后进入 30 秒轮询；若 HTTP 同步也失败，按普通 API 故障处理。
5. 模板渲染失败时按模板键、版本和稳定错误码定位，不采集模板正文、变量值或姓名。

回滚应用时保留模板发布历史、激活历史、通知快照和新增列。已应用迁移不得修改或删除。
