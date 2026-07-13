import { uiWebThemeDefaults } from '../src';
import { columnKeys, type ColumnKey } from './table-definition';

export type TableSize = 'large' | 'middle' | 'small';
export type PreviewState = 'normal' | 'loading' | 'empty';
export type { ColumnKey } from './table-definition';

export interface DataTableDesignSettings {
  bordered: boolean;
  borderRadius: number;
  headerBackground: string;
  pageSize: number;
  pagination: boolean;
  previewState: PreviewState;
  primaryColor: string;
  rowSelection: boolean;
  searchable: boolean;
  size: TableSize;
  visibleColumns: ColumnKey[];
}

export const defaultDesignSettings: DataTableDesignSettings = {
  bordered: false,
  borderRadius: uiWebThemeDefaults.borderRadius,
  headerBackground: uiWebThemeDefaults.tableHeaderBackground,
  pageSize: 5,
  pagination: true,
  previewState: 'normal',
  primaryColor: uiWebThemeDefaults.primaryColor,
  rowSelection: false,
  searchable: true,
  size: 'middle',
  visibleColumns: [...columnKeys],
};
