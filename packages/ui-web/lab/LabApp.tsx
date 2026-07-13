import {
  CheckOutlined,
  CopyOutlined,
  ReloadOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { UiWebProvider } from '../src';
import { DataTablePreview } from './components/DataTablePreview';
import { SettingsPanel } from './components/SettingsPanel';
import {
  columnKeys,
  type ColumnKey,
} from './table-definition';
import {
  defaultDesignSettings,
  type DataTableDesignSettings,
  type PreviewState,
  type TableSize,
} from './types';

const storageKey = 'zsj-ui-web:data-table-design';

function isTableSize(value: unknown): value is TableSize {
  return value === 'large' || value === 'middle' || value === 'small';
}

function isPreviewState(value: unknown): value is PreviewState {
  return value === 'normal' || value === 'loading' || value === 'empty';
}

function isColumnKey(value: unknown): value is ColumnKey {
  return columnKeys.includes(value as ColumnKey);
}

function loadSettings(): DataTableDesignSettings {
  try {
    const rawSettings = window.localStorage.getItem(storageKey);
    if (!rawSettings) return defaultDesignSettings;

    const stored = JSON.parse(rawSettings) as Partial<DataTableDesignSettings>;
    return {
      ...defaultDesignSettings,
      ...stored,
      previewState: isPreviewState(stored.previewState)
        ? stored.previewState
        : defaultDesignSettings.previewState,
      size: isTableSize(stored.size)
        ? stored.size
        : defaultDesignSettings.size,
      visibleColumns: Array.isArray(stored.visibleColumns)
        ? stored.visibleColumns.filter(isColumnKey)
        : defaultDesignSettings.visibleColumns,
    };
  } catch {
    return defaultDesignSettings;
  }
}

export function LabApp() {
  const [settings, setSettings] = useState(loadSettings);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  const theme = useMemo(
    () => ({
      token: {
        colorPrimary: settings.primaryColor,
        borderRadius: settings.borderRadius,
      },
      components: {
        Table: {
          headerBg: settings.headerBackground,
        },
      },
    }),
    [settings.borderRadius, settings.headerBackground, settings.primaryColor],
  );

  const updateSettings = (patch: Partial<DataTableDesignSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const resetSettings = () => {
    window.localStorage.removeItem(storageKey);
    setSettings({ ...defaultDesignSettings, visibleColumns: [...columnKeys] });
  };

  const copySettings = async () => {
    await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <UiWebProvider theme={theme}>
      <div className="lab-app">
        <header className="lab-header">
          <div className="lab-brand">
            <span className="lab-brand-mark">AI</span>
            <span>AI-CRM 组件设计台</span>
          </div>
          <div className="lab-header-actions">
            <Tooltip title="恢复默认">
              <Button
                aria-label="恢复默认"
                icon={<ReloadOutlined />}
                shape="circle"
                type="text"
                onClick={resetSettings}
              />
            </Tooltip>
            <Tooltip title={copied ? '已复制' : '复制配置'}>
              <Button
                aria-label="复制配置"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                shape="circle"
                type="text"
                onClick={() => void copySettings()}
              />
            </Tooltip>
          </div>
        </header>

        <div className="lab-layout">
          <nav className="lab-sidebar" aria-label="组件目录">
            <div className="lab-panel-title">组件</div>
            <div className="lab-nav-group">数据展示</div>
            <button className="lab-nav-item lab-nav-item-active" type="button">
              <TableOutlined />
              <span>数据表格</span>
            </button>
          </nav>

          <main className="lab-main">
            <div className="lab-canvas-header">
              <h1>数据表格</h1>
              <span>桌面端</span>
            </div>
            <div className="lab-canvas">
              <DataTablePreview
                settings={settings}
                onChange={updateSettings}
              />
            </div>
          </main>

          <SettingsPanel settings={settings} onChange={updateSettings} />
        </div>
      </div>
    </UiWebProvider>
  );
}
