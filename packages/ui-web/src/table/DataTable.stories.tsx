import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProColumns } from '@ant-design/pro-components';
import { useMemo, useState } from 'react';
import { DataTable } from './DataTable';
import {
  demoLeadRecords,
  type DemoLeadRecord,
} from './DataTable.fixtures';

interface TablePreviewProps {
  bordered: boolean;
  loading: boolean;
  searchable: boolean;
  size: 'large' | 'middle' | 'small';
  withData: boolean;
}

const columns: ProColumns<DemoLeadRecord>[] = [
  {
    title: '客资编号',
    dataIndex: 'code',
    copyable: true,
    width: 150,
  },
  {
    title: '客户',
    dataIndex: 'customer',
    ellipsis: true,
    width: 180,
  },
  {
    title: '来源渠道',
    dataIndex: 'channel',
    valueType: 'select',
    width: 130,
    valueEnum: {
      wecom: { text: '企业微信' },
      referral: { text: '转介绍' },
      website: { text: '官网' },
    },
  },
  {
    title: '负责人',
    dataIndex: 'owner',
    width: 140,
  },
  {
    title: '跟进状态',
    dataIndex: 'status',
    valueType: 'select',
    width: 130,
    valueEnum: {
      pending: { text: '待跟进', status: 'Default' },
      following: { text: '跟进中', status: 'Processing' },
      qualified: { text: '已有效', status: 'Success' },
    },
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    search: false,
    width: 180,
  },
];

function TablePreview({
  bordered,
  loading,
  searchable,
  size,
  withData,
}: TablePreviewProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    if (!withData) return [];

    return demoLeadRecords.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        return String(record[key as keyof DemoLeadRecord]).includes(value);
      }),
    );
  }, [filters, withData]);

  return (
    <div style={{ minHeight: '100vh', padding: 24 }}>
      <DataTable<DemoLeadRecord>
        bordered={bordered}
        columns={columns}
        columnsState={{
          persistenceKey: 'ui-web-data-table-demo',
          persistenceType: 'localStorage',
        }}
        dataSource={rows}
        headerTitle="客资列表"
        loading={loading}
        onReset={() => setFilters({})}
        onSubmit={(params) =>
          setFilters(
            Object.fromEntries(
              Object.entries(params).map(([key, value]) => [
                key,
                String(value ?? ''),
              ]),
            ),
          )
        }
        pagination={{ pageSize: 10 }}
        search={searchable ? { labelWidth: 'auto' } : false}
        size={size}
        scroll={{ x: 910 }}
      />
    </div>
  );
}

const meta = {
  title: 'Data Display/DataTable',
  component: TablePreview,
  tags: ['autodocs'],
  args: {
    bordered: false,
    loading: false,
    searchable: true,
    size: 'middle',
    withData: true,
  },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['large', 'middle', 'small'],
    },
  },
} satisfies Meta<typeof TablePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    bordered: true,
    searchable: false,
    size: 'small',
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    withData: false,
  },
};
