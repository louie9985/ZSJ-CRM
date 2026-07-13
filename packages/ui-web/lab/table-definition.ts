import type { ProColumns } from '@ant-design/pro-components';
import type { DemoLeadRecord } from './fixtures/demo-leads';

export const dataTableColumnDefinitions = [
  {
    key: 'code',
    label: '客资编号',
    column: {
      copyable: true,
      width: 150,
    },
  },
  {
    key: 'customer',
    label: '客户',
    column: {
      ellipsis: true,
      width: 170,
    },
  },
  {
    key: 'channel',
    label: '来源渠道',
    column: {
      valueType: 'select',
      search: false,
      width: 130,
      valueEnum: {
        wecom: { text: '企业微信' },
        referral: { text: '转介绍' },
        website: { text: '官网' },
        event: { text: '线下活动' },
      },
    },
  },
  {
    key: 'owner',
    label: '负责人',
    column: {
      search: false,
      width: 140,
    },
  },
  {
    key: 'status',
    label: '跟进状态',
    column: {
      valueType: 'select',
      search: false,
      width: 130,
      valueEnum: {
        pending: { text: '待跟进', status: 'Default' },
        following: { text: '跟进中', status: 'Processing' },
        qualified: { text: '已有效', status: 'Success' },
      },
    },
  },
  {
    key: 'createdAt',
    label: '创建时间',
    column: {
      valueType: 'dateTime',
      search: false,
      width: 180,
    },
  },
] as const satisfies readonly {
  key: keyof DemoLeadRecord;
  label: string;
  column: ProColumns<DemoLeadRecord>;
}[];

export type ColumnKey =
  (typeof dataTableColumnDefinitions)[number]['key'];

export const columnKeys: ColumnKey[] =
  dataTableColumnDefinitions.map(({ key }) => key);

export const dataTableColumns: ProColumns<DemoLeadRecord>[] =
  dataTableColumnDefinitions.map(({ column, key, label }) => ({
    ...column,
    dataIndex: key,
    title: label,
  }));
