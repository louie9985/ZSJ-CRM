import type { ThemeConfig } from 'antd';

export const uiWebThemeDefaults = {
  borderRadius: 6,
  primaryColor: '#1677ff',
  tableHeaderBackground: '#fafafa',
} as const;

/**
 * 保持 Ant Design Pro 的原生视觉，只集中暴露后续可调整的主题入口。
 */
export const defaultUiWebTheme: ThemeConfig = {
  token: {
    colorPrimary: uiWebThemeDefaults.primaryColor,
    borderRadius: uiWebThemeDefaults.borderRadius,
  },
  components: {
    Table: {
      headerBg: uiWebThemeDefaults.tableHeaderBackground,
    },
  },
};
