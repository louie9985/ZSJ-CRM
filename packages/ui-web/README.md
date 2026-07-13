# @zsj/ui-web

AI-CRM PC Web 组件库。正式组件位于 `src/`，轻量组件设计台位于 `lab/`。

```bash
pnpm ui:dev
```

访问 <http://localhost:6006>。设计台使用虚构数据，不连接后端；当前配置保存在浏览器本地。

## 正式页面使用

```tsx
import { DataTable, UiWebProvider } from '@zsj/ui-web';

<UiWebProvider>
  <DataTable columns={columns} dataSource={rows} loading={isLoading} />
</UiWebProvider>;
```

`DataTable` 不接受 ProTable 的 `request`、轮询等内置请求属性。服务端状态必须由 shared-core/TanStack Query 管理，再以 `dataSource`、`loading` 和受控分页属性传入。
