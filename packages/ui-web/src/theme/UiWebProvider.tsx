import {
  ProConfigProvider,
  zhCNIntl,
} from '@ant-design/pro-components';
import { ConfigProvider } from 'antd';
import type { ConfigProviderProps, ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { defaultUiWebTheme } from './theme';

export interface UiWebProviderProps {
  children: ReactNode;
  componentSize?: ConfigProviderProps['componentSize'];
  locale?: ConfigProviderProps['locale'];
  theme?: ThemeConfig;
}

export function UiWebProvider({
  children,
  componentSize,
  locale = zhCN,
  theme,
}: UiWebProviderProps) {
  const mergedTheme = useMemo<ThemeConfig>(
    () => ({
      ...defaultUiWebTheme,
      ...theme,
      token: {
        ...defaultUiWebTheme.token,
        ...theme?.token,
      },
      components: {
        ...defaultUiWebTheme.components,
        ...theme?.components,
      },
    }),
    [theme],
  );

  return (
    <ConfigProvider
      componentSize={componentSize}
      locale={locale}
      theme={mergedTheme}
    >
      <ProConfigProvider intl={zhCNIntl}>{children}</ProConfigProvider>
    </ConfigProvider>
  );
}
