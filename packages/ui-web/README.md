# @zsj/ui-web

AI-CRM PC Web 组件库。当前只提供基于 Ant Design Pro 的受控表格和统一主题入口。

```bash
pnpm ui:dev
```

访问 <http://localhost:6006>。

## 使用

```tsx
import { DataTable, UiWebProvider } from '@zsj/ui-web';

<UiWebProvider>
  <DataTable columns={columns} dataSource={rows} loading={isLoading} />
</UiWebProvider>;
```

`DataTable` 不接受 ProTable 的 `request`、轮询等内置请求属性。服务端状态必须由 shared-core/TanStack Query 管理，再以 `dataSource`、`loading` 和受控分页属性传入。
