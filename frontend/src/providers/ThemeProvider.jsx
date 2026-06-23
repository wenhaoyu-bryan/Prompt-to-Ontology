import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';

const STORAGE_MODE = 'pto-theme-mode';
const STORAGE_COLOR = 'pto-theme-color';

const COLOR_PRESETS = {
  blue:   { primary: '#1677ff' },
  cyan:   { primary: '#13c2c2' },
  green:  { primary: '#52c41a' },
  purple: { primary: '#722ed1' },
  orange: { primary: '#fa8c16' },
  indigo: { primary: '#6366F1' },
};

const ThemeContext = createContext({
  mode: 'light',
  color: 'indigo',
  setMode: () => {},
  setColor: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_MODE) || 'light');
  const [color, setColor] = useState(() => localStorage.getItem(STORAGE_COLOR) || 'indigo');

  useEffect(() => { localStorage.setItem(STORAGE_MODE, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(STORAGE_COLOR, color); }, [color]);

  const themeConfig = useMemo(() => {
    const preset = COLOR_PRESETS[color] || COLOR_PRESETS.indigo;

    const lightTokens = {
      colorPrimary: preset.primary,
      colorInfo: preset.primary,
      colorBgLayout: '#F6F7FB',
      colorBgContainer: '#FFFFFF',
      colorBgElevated: '#FFFFFF',
      colorText: '#1F2937',
      colorTextSecondary: '#6B7280',
      colorTextTertiary: '#9CA3AF',
      colorBorder: '#E5E7EB',
      colorBorderSecondary: '#EEF0F4',
      borderRadius: 6,
      borderRadiusLG: 8,
      fontSize: 14,
      controlHeight: 36,
    };

    const darkTokens = {
      colorPrimary: preset.primary,
      borderRadius: 6,
      borderRadiusLG: 8,
    };

    return {
      algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token: mode === 'dark' ? darkTokens : lightTokens,
      components: {
        Layout: {
          siderBg: mode === 'dark' ? '#141414' : '#FFFFFF',
          headerBg: mode === 'dark' ? '#141414' : '#FFFFFF',
          bodyBg: mode === 'dark' ? '#0F0F0F' : '#F6F7FB',
        },
        Menu: {
          itemBg: 'transparent',
          itemSelectedBg: mode === 'dark' ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF',
          itemSelectedColor: '#6366F1',
          itemHoverBg: mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#F4F5F8',
          itemBorderRadius: 6,
          itemHeight: 40,
          subMenuItemBg: 'transparent',
        },
        Card: {
          borderRadiusLG: 8,
        },
        Button: {
          borderRadius: 6,
          controlHeight: 36,
        },
        Input: {
          controlHeight: 36,
        },
        Select: {
          controlHeight: 36,
        },
        Table: {
          cellPaddingBlock: 12,
          cellPaddingInline: 16,
        },
      },
    };
  }, [mode, color]);

  const ctx = useMemo(() => ({
    mode,
    color,
    setMode,
    setColor,
    colorPresets: COLOR_PRESETS,
  }), [mode, color]);

  return (
    <ThemeContext.Provider value={ctx}>
      <ConfigProvider theme={themeConfig}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
