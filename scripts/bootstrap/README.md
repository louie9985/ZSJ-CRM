# Local Bootstrap

本地开发使用 `scripts/bootstrap/local-dev.mjs` 作为唯一入口：

```text
pnpm local:infra
pnpm local:migrate
pnpm local:bootstrap
pnpm local:api
pnpm local:web
pnpm local:doctor
```

`compose-secrets.mjs dev` 在忽略提交的 `deploy/compose/.runtime/dev/` 下生成受限随机文件，其中认证只使用 `session_index_key` 与 `system_admin_password`。密码不会作为命令行参数或日志输出。

`pnpm local:api` 在前台运行 API/BFF，并将结构化 JSON 日志输出到启动该命令的终端。请求日志只包含固定操作名、方法、状态、耗时和 Trace ID，不包含 Cookie、密码、请求体或账号标识；浏览器响应中的 `X-Trace-Id` 可用于定位对应日志。`pnpm local:doctor` 只检查服务可用性，不会代替 API 日志。

`local:bootstrap` 从空库创建唯一 `system.admin`，以及配套 Person、Employment、Assignment、Account、Argon2id Credential 和全局 `system_administrator` 角色。脚本以稳定 ID 幂等；第二次执行只核对现有事实，不再次读取或处理密码。任何不匹配状态失败关闭。

本地 API 默认监听 `127.0.0.1:13001`，CRM Web 为 `127.0.0.1:3000`。PC、员工移动和兼职入口均由同一 Web 制品提供。
