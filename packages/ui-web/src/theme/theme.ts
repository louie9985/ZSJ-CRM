import type { ThemeConfig } from 'antd';

/**
 * 保持 Ant Design Pro 的原生视觉，只集中暴露后续可调整的主题入口。
 */
export const defaultUiWebTheme: ThemeConfig = {
  token: {
    colorPrimary: '#0958d9',
    borderRadius: 6,
  },
  components: {
    Table: {
      headerBg: '#fafafa',
    },
  },
};
