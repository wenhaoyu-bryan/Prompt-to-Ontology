import { useState, useEffect } from 'react';
import { Layout, Menu, Dropdown, Space, Tag, Button, Drawer, Grid, Avatar, theme } from 'antd';
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
  BulbOutlined,
  GlobalOutlined,
  ApiOutlined,
  SafetyOutlined,
  ExperimentOutlined,
  EyeOutlined,
  RocketOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../../providers/ThemeProvider';

const { Sider, Header, Content } = Layout;
const { useBreakpoint } = Grid;

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useThemeContext();
  const { token } = theme.useToken();

  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTablet = screens.md && !screens.lg;

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      key: 'group-home',
      type: 'group',
      label: !collapsed ? t('nav.groupHome') : null,
      children: [
        { key: '/dashboard', icon: <DashboardOutlined />, label: t('nav.dashboard') },
        { key: '/demo-center', icon: <RocketOutlined />, label: t('nav.demoCenter') },
      ],
    },
    {
      key: 'group-build',
      type: 'group',
      label: !collapsed ? t('nav.groupBuild') : null,
      children: [
        { key: '/pipeline', icon: <ApiOutlined />, label: t('nav.pipeline') },
        { key: '/schema', icon: <ApartmentOutlined />, label: t('nav.schema') },
        { key: '/review', icon: <AuditOutlined />, label: t('nav.review') },
      ],
    },
    {
      key: 'group-explore',
      type: 'group',
      label: !collapsed ? t('nav.groupExplore') : null,
      children: [
        { key: '/objects', icon: <AppstoreOutlined />, label: t('nav.objects') },
        { key: '/graph', icon: <NodeIndexOutlined />, label: t('nav.graph') },
      ],
    },
    {
      key: 'group-operate',
      type: 'group',
      label: !collapsed ? t('nav.groupOperate') : null,
      children: [
        { key: '/agent', icon: <RobotOutlined />, label: t('nav.agent') },
        { key: '/graph-governance', icon: <SafetyOutlined />, label: t('nav.graphGovernance') },
        { key: '/rule-studio', icon: <ExperimentOutlined />, label: t('nav.ruleStudio') },
        { key: '/agent-traces', icon: <EyeOutlined />, label: t('nav.agentTrace') },
      ],
    },
    {
      key: 'group-admin',
      type: 'group',
      label: !collapsed ? t('nav.groupAdmin') : null,
      children: [
        { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings') },
      ],
    },
  ];

  const currentKey = '/' + (location.pathname.split('/')[1] || 'dashboard');

  const userMenuItems = [
    {
      key: 'theme',
      icon: <BulbOutlined />,
      label: mode === 'dark' ? t('settings.lightMode') : t('settings.darkMode'),
      onClick: () => setMode(mode === 'dark' ? 'light' : 'dark'),
    },
    {
      key: 'lang',
      icon: <GlobalOutlined />,
      label: i18n.language === 'en' ? t('settings.chinese') : 'English',
      onClick: () => {
        const next = i18n.language === 'en' ? 'zh' : 'en';
        i18n.changeLanguage(next);
        localStorage.setItem('pto-lang', next);
      },
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('auth.logout'),
      danger: true,
      onClick: () => {
        localStorage.removeItem('pto-auth');
        window.location.href = '/login';
      },
    },
  ];

  const sidebarContent = (
    <>
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: (collapsed && !isMobile) ? 'center' : 'flex-start',
        padding: (collapsed && !isMobile) ? '0' : '0 16px',
        gap: 10,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <img
          src="/project_profile.png"
          alt="Logo"
          style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
        />
        {(!collapsed || isMobile) && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {t('app.name')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.5, whiteSpace: 'nowrap' }}>
              {t('app.demoTag')}
            </div>
          </div>
        )}
      </div>

      <Menu
        className="sidebar-menu"
        mode="inline"
        selectedKeys={[currentKey]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ border: 'none', marginTop: 4 }}
      />
    </>
  );

  const sidebarWidth = isMobile ? 0 : isTablet ? 60 : (collapsed ? 80 : 220);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop / Tablet sidebar */}
      {!isMobile && (
        <Sider
          collapsible={!isTablet}
          collapsed={isTablet ? true : collapsed}
          onCollapse={setCollapsed}
          width={isTablet ? 60 : 220}
          collapsedWidth={isTablet ? 60 : 80}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
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
          width={220}
          styles={{ body: { padding: 0 } }}
          closable={false}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout style={{ marginLeft: sidebarWidth, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          height: 56,
          lineHeight: '56px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <Space size={12}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                style={{ fontSize: 18 }}
              />
            )}
            <Tag color="processing" style={{ margin: 0, border: 'none' }}>{t('app.demoTag')}</Tag>
          </Space>

          <Space size={16}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Button type="text" size="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Space size={6}>
                  <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />
                  {!isMobile && <span style={{ fontSize: 14 }}>{t('auth.demoUser')}</span>}
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: isMobile ? 12 : isTablet ? 16 : 24, background: token.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
