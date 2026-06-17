import { useState } from 'react';
import { Layout, Menu, Dropdown, Space, Tag, Button } from 'antd';
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
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../../providers/ThemeProvider';

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useThemeContext();

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          borderRight: mode === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
        }}
      >
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 16px',
          gap: 10,
          borderBottom: mode === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
        }}>
          <img
            src="/project_profile.png"
            alt="Logo"
            style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
          />
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                {t('app.name')}
              </div>
              <div style={{ fontSize: 10, opacity: 0.5, whiteSpace: 'nowrap' }}>
                {t('app.demoTag')}
              </div>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[currentKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', marginTop: 4 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: mode === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
          height: 56,
          lineHeight: '56px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <Space size={12}>
            <Tag color="processing" style={{ margin: 0 }}>{t('app.demoTag')}</Tag>
          </Space>

          <Space size={16}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Button type="text" size="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserOutlined />
                <span style={{ fontSize: 13 }}>{t('auth.demoUser')}</span>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
