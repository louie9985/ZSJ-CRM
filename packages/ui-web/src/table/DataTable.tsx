import { ProTable } from '@ant-design/pro-components';
import type { ProTableProps } from '@ant-design/pro-components';

// ProTable 的公开泛型使用 any，保持一致才能接受不带索引签名的业务 DTO。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataRecord = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableParams = Record<string, any>;

type ProTableRequestProps =
  | 'request'
  | 'params'
  | 'postData'
  | 'polling'
  | 'revalidateOnFocus'
  | 'onRequestError'
  | 'manualRequest';

export type DataTableProps<
  DataType extends DataRecord,
  Params extends TableParams = TableParams,
  ValueType = 'text',
> = Omit<
  ProTableProps<DataType, Params, ValueType>,
  ProTableRequestProps
> & {
  /** 由 TanStack Query 的 refetch 或等价受控动作提供。 */
  onReload?: () => void | Promise<void>;
};

/**
 * CRM Web 的受控 ProTable。数据请求留在 shared-core/TanStack Query，
 * 本模块只统一表格的视觉和交互默认值。
 */
export function DataTable<
  DataType extends DataRecord,
  Params extends TableParams = TableParams,
  ValueType = 'text',
>({
  defaultSize = 'middle',
  onReload,
  options,
  pagination,
  rowKey = 'id',
  search,
  ...props
}: DataTableProps<DataType, Params, ValueType>) {
  const resolvedOptions =
    options === false
      ? false
      : {
          density: true,
          fullScreen: true,
          reload: onReload
            ? () => {
                void onReload();
              }
            : false,
          setting: true,
          ...options,
        };

  const resolvedPagination =
    pagination === false
      ? false
      : {
          showSizeChanger: true,
          showTotal: (total: number) => `共 ${total} 条`,
          ...pagination,
        };

  return (
    <ProTable<DataType, Params, ValueType>
      {...props}
      defaultSize={defaultSize}
      options={resolvedOptions}
      pagination={resolvedPagination}
      rowKey={rowKey}
      search={search === undefined ? { labelWidth: 'auto' } : search}
    />
  );
}
