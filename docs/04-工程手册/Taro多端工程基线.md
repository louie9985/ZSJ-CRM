# Taro 内部 H5 工程基线

- 状态：已实施
- 适用范围：历史 Taro 工程迁移记录；当前正式入口为 `apps/workbench-web` 的 `/mobile/*`
- 架构依据：ADR-0034

当前不再发布独立 Taro H5 制品。员工移动页面由 CRM Web 的响应式 `/mobile/*` 路由提供，与 PC 共用账号、Cookie、Session 和授权。

development 与 production runtime 均调用同源 `/auth/internal-h5/*`。本地开发服务器通过 `AI_CRM_INTERNAL_MOBILE_BFF_ORIGIN` 代理 `/auth`；未设置时使用 `http://127.0.0.1:13001`。正式制品不得加载 development fixture 或保存登录密码。

每次行为变更至少验证 lint、typecheck、单元/组件测试、H5 构建、包体检查，以及 Cookie surface 隔离、CSRF、过期/撤销和重复登录。当前不构建微信小程序、外部 H5 或原生应用。
