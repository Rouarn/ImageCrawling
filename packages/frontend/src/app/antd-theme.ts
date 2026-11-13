import { theme, type ThemeConfig } from 'antd';

export const FONT_FAMILY =
  '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

const ACCENT_LIGHT = '#5a5cf0';
const ACCENT_DARK = '#8b8dff';

export function buildAntdTheme(isDark: boolean): ThemeConfig {
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? ACCENT_DARK : ACCENT_LIGHT,
      colorInfo: isDark ? ACCENT_DARK : ACCENT_LIGHT,
      colorSuccess: isDark ? '#4ade80' : '#15803d',
      colorWarning: isDark ? '#fbbf24' : '#b45309',
      colorError: isDark ? '#f87171' : '#dc2626',
      colorTextBase: isDark ? '#eceef4' : '#14161c',
      colorBgBase: isDark ? '#08090c' : '#f4f4f7',
      colorBgContainer: isDark ? '#111318' : '#ffffff',
      colorBgElevated: isDark ? '#171a21' : '#ffffff',
      colorBorder: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(17,20,28,0.16)',
      colorBorderSecondary: isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(17,20,28,0.08)',
      fontFamily: FONT_FAMILY,
      fontSize: 14,
      borderRadius: 12,
      borderRadiusLG: 16,
      borderRadiusSM: 8,
      controlHeight: 38,
      controlHeightLG: 44,
      wireframe: false,
    },
    components: {
      Button: {
        fontWeight: 500,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Input: {
        activeShadow: isDark
          ? '0 0 0 3px rgba(139,141,255,0.2)'
          : '0 0 0 3px rgba(90,92,240,0.14)',
        paddingBlock: 8,
      },
      InputNumber: {
        activeShadow: isDark
          ? '0 0 0 3px rgba(139,141,255,0.2)'
          : '0 0 0 3px rgba(90,92,240,0.14)',
      },
      Select: { optionSelectedBg: isDark ? '#232838' : '#eef0ff' },
      Segmented: {
        itemSelectedBg: isDark ? '#232838' : '#ffffff',
        trackBg: isDark ? '#15181e' : '#eceef3',
      },
      Modal: {
        contentBg: isDark ? '#111318' : '#ffffff',
        headerBg: isDark ? '#111318' : '#ffffff',
      },
      Tooltip: { colorBgSpotlight: isDark ? '#232838' : '#1f2430' },
      Pagination: { itemActiveBg: isDark ? '#232838' : '#eceef3' },
      Switch: { colorPrimary: isDark ? ACCENT_DARK : ACCENT_LIGHT },
    },
  };
}
