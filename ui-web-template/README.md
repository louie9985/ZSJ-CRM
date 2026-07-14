# HeroUI Pro 四模板集成预览

此目录是独立效果预览，不引用或修改 AI-CRM 主项目代码。页面直接复用 `templates/` 下下载的四套 HeroUI Pro 官方模板源码，仅增加最左侧中文模板导航，并将主要界面文案与 Mock 数据中文化。

## 启动

在仓库根目录执行：

```bash
pnpm --dir ui-web-template install
pnpm --dir ui-web-template dev
```

浏览器打开 [http://127.0.0.1:4180](http://127.0.0.1:4180)。开发端口固定为 `4180`，开发模式使用 Webpack 以避开 Windows 下 Next.js Turbopack 解析 pnpm CSS 链接的问题。

## 页面

- `/dashboard`：数据看板模板
- `/email`：邮件模板
- `/chat`：智能助手模板
- `/finances`：财务模板

四套模板自己的二级页面和侧栏导航均保留，根路径会自动跳转到 `/dashboard`。

## 验证

```bash
pnpm --dir ui-web-template typecheck
pnpm --dir ui-web-template test:navigation
pnpm --dir ui-web-template build
```
