import {
  Checkbox,
  ColorPicker,
  InputNumber,
  Segmented,
  Slider,
  Switch,
} from 'antd';
import {
  dataTableColumnDefinitions,
  type ColumnKey,
} from '../table-definition';
import type {
  DataTableDesignSettings,
  PreviewState,
  TableSize,
} from '../types';

interface SettingsPanelProps {
  onChange: (patch: Partial<DataTableDesignSettings>) => void;
  settings: DataTableDesignSettings;
}

export function SettingsPanel({
  onChange,
  settings,
}: SettingsPanelProps) {
  return (
    <aside className="lab-inspector" aria-label="属性设置">
      <div className="lab-panel-title">属性</div>

      <section className="lab-setting-section">
        <h2>表格</h2>
        <label className="lab-field-stack">
          <span>尺寸</span>
          <Segmented
            block
            options={[
              { label: '宽松', value: 'large' },
              { label: '中等', value: 'middle' },
              { label: '紧凑', value: 'small' },
            ]}
            value={settings.size}
            onChange={(value) => onChange({ size: value as TableSize })}
          />
        </label>

        <label className="lab-field-stack">
          <span>预览状态</span>
          <Segmented
            block
            options={[
              { label: '正常', value: 'normal' },
              { label: '加载', value: 'loading' },
              { label: '空数据', value: 'empty' },
            ]}
            value={settings.previewState}
            onChange={(value) =>
              onChange({ previewState: value as PreviewState })
            }
          />
        </label>

        <div className="lab-setting-row">
          <span>搜索区域</span>
          <Switch
            checked={settings.searchable}
            onChange={(searchable) => onChange({ searchable })}
          />
        </div>
        <div className="lab-setting-row">
          <span>表格边框</span>
          <Switch
            checked={settings.bordered}
            onChange={(bordered) => onChange({ bordered })}
          />
        </div>
        <div className="lab-setting-row">
          <span>行选择</span>
          <Switch
            checked={settings.rowSelection}
            onChange={(rowSelection) => onChange({ rowSelection })}
          />
        </div>
        <div className="lab-setting-row">
          <span>分页</span>
          <Switch
            checked={settings.pagination}
            onChange={(pagination) => onChange({ pagination })}
          />
        </div>
        <div className="lab-setting-row">
          <span>每页条数</span>
          <InputNumber
            disabled={!settings.pagination}
            min={5}
            max={50}
            step={5}
            value={settings.pageSize}
            onChange={(pageSize) =>
              onChange({ pageSize: pageSize ?? settings.pageSize })
            }
          />
        </div>
      </section>

      <section className="lab-setting-section">
        <h2>显示列</h2>
        <Checkbox.Group
          className="lab-column-list"
          value={settings.visibleColumns}
          onChange={(values) =>
            onChange({ visibleColumns: values as ColumnKey[] })
          }
        >
          {dataTableColumnDefinitions.map(({ key, label }) => (
            <Checkbox key={key} value={key}>
              {label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </section>

      <section className="lab-setting-section">
        <h2>主题</h2>
        <div className="lab-setting-row">
          <span>主色</span>
          <ColorPicker
            showText
            value={settings.primaryColor}
            onChange={(color) =>
              onChange({ primaryColor: color.toHexString() })
            }
          />
        </div>
        <div className="lab-setting-row">
          <span>表头背景</span>
          <ColorPicker
            showText
            value={settings.headerBackground}
            onChange={(color) =>
              onChange({ headerBackground: color.toHexString() })
            }
          />
        </div>
        <label className="lab-field-stack">
          <span>圆角 {settings.borderRadius}px</span>
          <Slider
            min={0}
            max={8}
            value={settings.borderRadius}
            onChange={(borderRadius) => onChange({ borderRadius })}
          />
        </label>
      </section>
    </aside>
  );
}
