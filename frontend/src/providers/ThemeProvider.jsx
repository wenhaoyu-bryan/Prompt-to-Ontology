import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { ConfigProvider, theme as antTheme } from "antd";

const STORAGE_MODE = "pto-theme-mode";
const STORAGE_COLOR = "pto-theme-color";

const COLOR_PRESETS = {
  blue: { primary: "#3267B1", darkPrimary: "#8BB4EA" },
  cyan: { primary: "#158A9A", darkPrimary: "#66CBD5" },
  green: { primary: "#28845C", darkPrimary: "#73CFA4" },
  purple: { primary: "#7655C7", darkPrimary: "#B5A0EE" },
  orange: { primary: "#C47A2B", darkPrimary: "#E9AD6E" },
  indigo: { primary: "#5667D8", darkPrimary: "#98A5FF" },
};

const ThemeContext = createContext({
  mode: "light",
  color: "blue",
  setMode: () => {},
  setColor: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() =>
    localStorage.getItem(STORAGE_MODE) === "dark" ? "dark" : "light",
  );
  const [color, setColor] = useState(
    () => localStorage.getItem(STORAGE_COLOR) || "blue",
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_MODE, mode);
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", mode === "dark" ? "#191919" : "#FFFFFF");
  }, [mode]);
  useEffect(() => {
    localStorage.setItem(STORAGE_COLOR, color);
    const preset = COLOR_PRESETS[color] || COLOR_PRESETS.blue;
    document.documentElement.style.setProperty(
      "--pto-primary",
      mode === "dark" ? preset.darkPrimary : preset.primary,
    );
  }, [color, mode]);

  const themeConfig = useMemo(() => {
    const preset = COLOR_PRESETS[color] || COLOR_PRESETS.blue;

    const primary = mode === "dark" ? preset.darkPrimary : preset.primary;
    const lightTokens = {
      colorPrimary: primary,
      colorInfo: primary,
      colorBgLayout: "#FFFFFF",
      colorBgContainer: "#FFFFFF",
      colorBgElevated: "#FFFFFF",
      colorText: "#37352F",
      colorTextSecondary: "#73726D",
      colorTextTertiary: "#8D8C87",
      colorBorder: "#DCDCD8",
      colorBorderSecondary: "#E9E9E7",
      colorFillAlter: "#F7F7F5",
      borderRadius: 4,
      borderRadiusLG: 6,
      fontSize: 14,
      controlHeight: 32,
    };

    const darkTokens = {
      colorPrimary: primary,
      colorInfo: primary,
      colorBgBase: "#191919",
      colorBgLayout: "#191919",
      colorBgContainer: "#191919",
      colorBgElevated: "#252525",
      colorText: "#EDEDEB",
      colorTextSecondary: "#B0AFAB",
      colorTextTertiary: "#91908B",
      colorBorder: "#42423F",
      colorBorderSecondary: "#343432",
      colorFillAlter: "#222221",
      borderRadius: 4,
      borderRadiusLG: 6,
      fontSize: 14,
      controlHeight: 32,
    };

    return {
      algorithm:
        mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token: {
        ...(mode === "dark" ? darkTokens : lightTokens),
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
        boxShadowSecondary: "0 6px 20px rgba(0,0,0,0.09)",
        controlOutline: mode === "dark" ? "#496586" : "#BDD2ED",
      },
      components: {
        Layout: {
          siderBg: mode === "dark" ? "#202020" : "#F7F7F5",
          headerBg: mode === "dark" ? "#191919" : "#FFFFFF",
          bodyBg: mode === "dark" ? "#191919" : "#FFFFFF",
        },
        Menu: {
          itemBg: "transparent",
          itemSelectedBg: mode === "dark" ? "#30302E" : "#EAEAE7",
          itemSelectedColor: mode === "dark" ? "#EDEDEB" : "#37352F",
          itemHoverBg: mode === "dark" ? "#2A2A28" : "#EEEEEB",
          itemBorderRadius: 4,
          itemHeight: 36,
          subMenuItemBg: "transparent",
        },
        Card: {
          borderRadiusLG: 6,
          headerFontSize: 14,
          bodyPadding: 20,
        },
        Button: {
          borderRadius: 4,
          controlHeight: 32,
          colorPrimary: mode === "dark" ? "#E0E0DC" : "#37352F",
          colorPrimaryHover: mode === "dark" ? "#F3F3F0" : "#514F48",
          colorPrimaryActive: mode === "dark" ? "#CDCDC7" : "#24231F",
          primaryColor: mode === "dark" ? "#191919" : "#FFFFFF",
          primaryShadow: "none",
          defaultShadow: "none",
        },
        Input: {
          controlHeight: 32,
        },
        Select: {
          controlHeight: 32,
        },
        Table: {
          cellPaddingBlock: 10,
          cellPaddingInline: 12,
          headerBg: mode === "dark" ? "#222221" : "#F7F7F5",
          headerBorderRadius: 4,
        },
      },
    };
  }, [mode, color]);

  const ctx = useMemo(
    () => ({
      mode,
      color,
      setMode,
      setColor,
      colorPresets: COLOR_PRESETS,
    }),
    [mode, color],
  );

  return (
    <ThemeContext.Provider value={ctx}>
      <ConfigProvider theme={themeConfig}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
