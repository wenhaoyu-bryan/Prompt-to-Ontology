import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';

const STORAGE_MODE = 'pto-theme-mode';
const STORAGE_COLOR = 'pto-theme-color';

const COLOR_PRESETS = {
  blue:   { primary: '#2869D8', darkPrimary: '#7BAAF7' },
  cyan:   { primary: '#158A9A', darkPrimary: '#66CBD5' },
  green:  { primary: '#28845C', darkPrimary: '#73CFA4' },
  purple: { primary: '#7655C7', darkPrimary: '#B5A0EE' },
  orange: { primary: '#C47A2B', darkPrimary: '#E9AD6E' },
  indigo: { primary: '#5667D8', darkPrimary: '#98A5FF' },
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

  useEffect(() => {
    localStorage.setItem(STORAGE_MODE, mode);
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  useEffect(() => {
    localStorage.setItem(STORAGE_COLOR, color);
    const preset = COLOR_PRESETS[color] || COLOR_PRESETS.indigo;
    document.documentElement.style.setProperty('--pto-primary', mode === 'dark' ? preset.darkPrimary : preset.primary);
  }, [color, mode]);

  const themeConfig = useMemo(() => {
    const preset = COLOR_PRESETS[color] || COLOR_PRESETS.indigo;

    const primary = mode === 'dark' ? preset.darkPrimary : preset.primary;
    const lightTokens = {
      colorPrimary: primary,
      colorInfo: primary,
      colorBgLayout: '#F3F6FA',
      colorBgContainer: '#FFFFFF',
      colorBgElevated: '#FFFFFF',
      colorText: '#202D3F',
      colorTextSecondary: '#607084',
      colorTextTertiary: '#8290A2',
      colorBorder: '#DCE4EE',
      colorBorderSecondary: '#E9EEF5',
      colorFillAlter: '#F6F8FC',
      borderRadius: 8,
      borderRadiusLG: 12,
      fontSize: 14,
      controlHeight: 36,
    };

    const darkTokens = {
      colorPrimary: primary,
      colorInfo: primary,
      colorBgBase: '#101827',
      colorBgLayout: '#101827',
      colorBgContainer: '#192536',
      colorBgElevated: '#213047',
      colorText: '#EDF3FB',
      colorTextSecondary: '#AFBED1',
      colorTextTertiary: '#8A9BB0',
      colorBorder: '#35465D',
      colorBorderSecondary: '#2C3C51',
      colorFillAlter: '#223248',
      borderRadius: 8,
      borderRadiusLG: 12,
      fontSize: 14,
      controlHeight: 36,
    };

    return {
      algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token: mode === 'dark' ? darkTokens : lightTokens,
      components: {
        Layout: {
          siderBg: mode === 'dark' ? '#172335' : '#FBFCFE',
          headerBg: mode === 'dark' ? '#192536' : '#FFFFFF',
          bodyBg: mode === 'dark' ? '#101827' : '#F3F6FA',
        },
        Menu: {
          itemBg: 'transparent',
          itemSelectedBg: `color-mix(in srgb, ${primary} ${mode === 'dark' ? '14%' : '10%'}, transparent)`,
          itemSelectedColor: primary,
          itemHoverBg: mode === 'dark' ? 'rgba(255,255,255,0.065)' : '#F0F4FA',
          itemBorderRadius: 8,
          itemHeight: 40,
          subMenuItemBg: 'transparent',
        },
        Card: {
          borderRadiusLG: 12,
        },
        Button: {
          borderRadius: 8,
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
