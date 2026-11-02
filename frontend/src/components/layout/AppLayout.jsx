import { useState, useEffect } from "react";
import {
  Layout,
  Menu,
  Dropdown,
  Space,
  Tag,
  Button,
  Drawer,
  Grid,
  Avatar,
  theme,
} from "antd";
import {
  DashboardOutlined,
  AppstoreOutlined,
  NodeIndexOutlined,
  ApartmentOutlined,
  RobotOutlined,
  AuditOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  LeftOutlined,
  RightOutlined,
  GlobalOutlined,
  ApiOutlined,
  SafetyOutlined,
  ExperimentOutlined,
  EyeOutlined,
  RocketOutlined,
  FileSearchOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useThemeContext } from "../../providers/ThemeProvider";
import AppLogo from "../common/AppLogo";

const { Sider, Header, Content } = Layout;
const { useBreakpoint } = Grid;
const TOOL_ROUTES = [
  "/review",
  "/graph-governance",
  "/rule-studio",
  "/agent-traces",
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState(
    TOOL_ROUTES.includes(location.pathname) ? ["tools"] : [],
  );
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useThemeContext();
  const { token } = theme.useToken();

  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTablet = screens.md && !screens.lg;
  const sidebarCollapsed = !isMobile && (isTablet || collapsed);

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
    setOpenKeys(TOOL_ROUTES.includes(location.pathname) ? ["tools"] : []);
  }, [location.pathname]);

  const menuItems = [
    {
      key: "group-workspace",
      type: "group",
      label: !sidebarCollapsed
        ? i18n.language.startsWith("zh")
          ? "工作区"
          : "Workspace"
        : null,
      children: [
        {
          key: "/dashboard",
          icon: <DashboardOutlined />,
          label: t("nav.dashboard"),
        },
        { key: "/pipeline", icon: <ApiOutlined />, label: t("nav.pipeline") },
        { key: "/schema", icon: <ApartmentOutlined />, label: t("nav.schema") },
        {
          key: "/objects",
          icon: <AppstoreOutlined />,
          label: t("nav.objects"),
        },
        { key: "/graph", icon: <NodeIndexOutlined />, label: t("nav.graph") },
        { key: "/agent", icon: <RobotOutlined />, label: t("nav.agent") },
        {
          key: "/verified-qa",
          icon: <FileSearchOutlined />,
          label: t("nav.verifiedQA"),
        },
      ],
    },
    {
      key: "tools",
      icon: <SafetyOutlined />,
      label: i18n.language.startsWith("zh")
        ? "治理与调试"
        : "Governance & tools",
      children: [
        { key: "/review", icon: <AuditOutlined />, label: t("nav.review") },
        {
          key: "/graph-governance",
          icon: <SafetyOutlined />,
          label: t("nav.graphGovernance"),
        },
        {
          key: "/rule-studio",
          icon: <ExperimentOutlined />,
          label: t("nav.ruleStudio"),
        },
        {
          key: "/agent-traces",
          icon: <EyeOutlined />,
          label: t("nav.agentTrace"),
        },
      ],
    },
    {
      key: "group-resources",
      type: "group",
      label: !sidebarCollapsed
        ? i18n.language.startsWith("zh")
          ? "资源"
          : "Resources"
        : null,
      children: [
        {
          key: "/demo-center",
          icon: <RocketOutlined />,
          label: t("nav.demoCenter"),
        },
        {
          key: "/settings",
          icon: <SettingOutlined />,
          label: t("nav.settings"),
        },
      ],
    },
  ];

  const currentKey = "/" + (location.pathname.split("/")[1] || "dashboard");
  const currentItem = menuItems
    .flatMap((item) => item.children || [])
    .find((item) => item.key === currentKey);

  const userMenuItems = [
    {
      key: "theme",
      icon: mode === "dark" ? <SunOutlined /> : <MoonOutlined />,
      label: mode === "dark" ? t("settings.lightMode") : t("settings.darkMode"),
      onClick: () => setMode(mode === "dark" ? "light" : "dark"),
    },
    {
      key: "lang",
      icon: <GlobalOutlined />,
      label: i18n.language === "en" ? t("settings.chinese") : "English",
      onClick: () => {
        const next = i18n.language === "en" ? "zh" : "en";
        i18n.changeLanguage(next);
        localStorage.setItem("pto-lang", next);
      },
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: t("auth.logout"),
      danger: true,
      onClick: () => {
        localStorage.removeItem("pto-auth");
        window.location.href = "/login";
      },
    },
  ];

  const sidebarContent = (
    <div className="sidebar-shell">
      <div
        className="sidebar-brand"
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: sidebarCollapsed ? "center" : "flex-start",
          padding: sidebarCollapsed ? "0" : "0 18px",
          gap: 10,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <AppLogo size={30} decorative />
        {!sidebarCollapsed && (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 650,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              {t("app.name")}
            </div>
            <div
              style={{
                fontSize: 12,
                color: token.colorTextSecondary,
                whiteSpace: "nowrap",
              }}
            >
              {t("app.demoTag")}
            </div>
          </div>
        )}
      </div>

      <Menu
        className="sidebar-menu"
        mode="inline"
        selectedKeys={[currentKey]}
        openKeys={sidebarCollapsed ? undefined : openKeys}
        onOpenChange={setOpenKeys}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ border: "none" }}
      />

      <div
        className="sidebar-footer"
        style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Button
          type="text"
          className="sidebar-theme-button"
          icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
          aria-label={
            mode === "dark"
              ? t("settings.switchToLight")
              : t("settings.switchToDark")
          }
          title={
            mode === "dark"
              ? t("settings.switchToLight")
              : t("settings.switchToDark")
          }
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        >
          {!sidebarCollapsed &&
            (mode === "dark"
              ? t("settings.lightMode")
              : t("settings.darkMode"))}
        </Button>
        {!isMobile && !isTablet && (
          <Button
            type="text"
            className="sidebar-collapse-button"
            icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
            aria-label={
              collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
            }
            title={
              collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
            }
            onClick={() => setCollapsed((value) => !value)}
          />
        )}
      </div>
    </div>
  );

  const sidebarWidth = isMobile ? 0 : sidebarCollapsed ? 64 : 224;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* Desktop / Tablet sidebar */}
      {!isMobile && (
        <Sider
          className="app-sider"
          collapsible={!isTablet}
          collapsed={sidebarCollapsed}
          trigger={null}
          width={224}
          collapsedWidth={64}
          style={{
            overflow: "hidden",
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {sidebarContent}
        </Sider>
      )}

      {/* Mobile drawer sidebar */}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={248}
          styles={{ body: { padding: 0 } }}
          closable={false}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout
        style={{ marginLeft: sidebarWidth, transition: "margin-left 0.2s" }}
      >
        <Header
          style={{
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
            height: 48,
            lineHeight: "48px",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={12}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label={
                  i18n.language.startsWith("zh")
                    ? "打开导航"
                    : "Open navigation"
                }
                onClick={() => setDrawerOpen(true)}
                style={{ fontSize: 18 }}
              />
            )}
            <span className="workspace-breadcrumb">
              <span>Pet Food</span>
              <span aria-hidden="true">/</span>
              <strong>{currentItem?.label || t("app.name")}</strong>
            </span>
          </Space>

          <Space size={16}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Button
                type="text"
                size="small"
                aria-label={t("auth.demoUser")}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Space size={6}>
                  <Avatar
                    size={24}
                    icon={<UserOutlined />}
                    style={{
                      backgroundColor: token.colorFillAlter,
                      color: token.colorTextSecondary,
                    }}
                  />
                  {!isMobile && (
                    <span style={{ fontSize: 14 }}>{t("auth.demoUser")}</span>
                  )}
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            padding: isMobile ? 12 : isTablet ? 16 : "20px 24px",
            background: token.colorBgLayout,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
