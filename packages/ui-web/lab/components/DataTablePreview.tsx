import type {
  ColumnsState,
} from '@ant-design/pro-components';
import { useMemo, useState } from 'react';
import { DataTable } from '../../src';
import {
  demoLeadRecords,
  type DemoLeadRecord,
} from '../fixtures/demo-leads';
import {
  columnKeys,
  dataTableColumns,
  type ColumnKey,
} from '../table-definition';
import type { DataTableDesignSettings } from '../types';

interface DataTablePreviewProps {
  onChange: (patch: Partial<DataTableDesignSettings>) => void;
  settings: DataTableDesignSettings;
}

function toColumnState(
  visibleColumns: ColumnKey[],
): Record<string, ColumnsState> {
  return Object.fromEntries(
    columnKeys.map((key) => [
      key,
      { show: visibleColumns.includes(key) },
    ]),
  );
}

export function DataTablePreview({
  onChange,
  settings,
}: DataTablePreviewProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filteredRows = useMemo(
    () =>
      demoLeadRecords.filter((record) =>
        Object.entries(filters).every(([key, value]) => {
          if (!value) return true;
          return String(record[key as keyof DemoLeadRecord]).includes(value);
        }),
      ),
    [filters],
  );

  const rows = settings.previewState === 'empty' ? [] : filteredRows;

  const handleColumnChange = (nextState: Record<string, ColumnsState>) => {
    onChange({
      visibleColumns: columnKeys.filter(
        (key) => nextState[key]?.show !== false,
      ),
    });
  };

  return (
    <DataTable<DemoLeadRecord>
      bordered={settings.bordered}
      columns={dataTableColumns}
      columnsState={{
        value: toColumnState(settings.visibleColumns),
        onChange: handleColumnChange,
      }}
      dataSource={rows}
      headerTitle="客资列表"
      loading={settings.previewState === 'loading'}
      onReset={() => setFilters({})}
      onSizeChange={(size) => {
        if (size) onChange({ size });
      }}
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
      pagination={
        settings.pagination ? { pageSize: settings.pageSize } : false
      }
      rowSelection={settings.rowSelection ? {} : false}
      search={settings.searchable ? { labelWidth: 'auto' } : false}
      size={settings.size}
      scroll={{ x: 900 }}
    />
  );
}
