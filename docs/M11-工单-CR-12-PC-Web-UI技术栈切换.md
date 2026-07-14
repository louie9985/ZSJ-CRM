# M11 工单：CR-12 PC Web UI 技术栈切换

> 状态：✅ 已由产品负责人于 2026-07-14 直接指示并放行

## 决策

- PC Web 从 React 18 + Ant Design Pro 切换为 React 19 + HeroUI Pro（CollectUI）+ HeroUI OSS + Tailwind CSS 4。
- `packages/ui-web` 旧组件库、设计台、Storybook 与 Ant Design 实现整体清除。
- `packages/web` 暂时只保留可编译空壳、shared-core 接口管道、TanStack Query 与路由依赖；页面和统一组件后续重新设计。
- HeroUI Pro 通过 `hpsetup` 配置；密钥仅使用环境变量 `HEROUI_KEY`，禁止写入仓库。

## 不变约束

- Web 仍只写视图，业务逻辑下沉 `shared-core`。
- P7-2/P7-3 统一列表/详情入口、服务端鉴权、URL 状态恢复等既有前端规范不变。
- 本次不新增业务模块、事件或 platform 接口。

## 验收

- 仓库代码、依赖清单与锁文件中无 Ant Design / `@zsj/ui-web` 运行时引用。
- `packages/ui-web` 不存在。
- `pnpm -w lint`、`pnpm -w tsc`、`pnpm -w test`、`pnpm -w build` 全绿。
- HeroUI Pro 安装器确认 React Pro 包已配置且为最新版本。
