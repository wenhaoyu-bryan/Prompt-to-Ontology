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
};

const ThemeContext = createContext({
  mode: 'dark',
  color: 'blue',
  setMode: () => {},
  setColor: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_MODE) || 'dark');
  const [color, setColor] = useState(() => localStorage.getItem(STORAGE_COLOR) || 'blue');

  useEffect(() => { localStorage.setItem(STORAGE_MODE, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(STORAGE_COLOR, color); }, [color]);

  const themeConfig = useMemo(() => ({
    algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: COLOR_PRESETS[color]?.primary || '#1677ff',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      Layout: {
        siderBg: mode === 'dark' ? '#141414' : '#ffffff',
        headerBg: mode === 'dark' ? '#141414' : '#ffffff',
        bodyBg: mode === 'dark' ? '#000000' : '#f5f5f5',
      },
      Menu: {
        darkItemBg: '#141414',
        darkSubMenuItemBg: '#141414',
      },
    },
  }), [mode, color]);

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
