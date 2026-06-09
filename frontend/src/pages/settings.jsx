import { Card, Row, Col, Typography, Space, Radio, Switch, Divider, Tag, Descriptions, List, Button, Modal, message } from 'antd';
import {
  BulbOutlined,
  GlobalOutlined,
  BgColorsOutlined,
  InfoCircleOutlined,
  SafetyOutlined,
  KeyOutlined,
  ApiOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../providers/ThemeProvider';

const { Title, Text, Link } = Typography;

const COLOR_OPTIONS = [
  { key: 'blue',   labelKey: 'settings.colorBlue',   color: '#1677ff' },
  { key: 'cyan',   labelKey: 'settings.colorCyan',   color: '#13c2c2' },
  { key: 'green',  labelKey: 'settings.colorGreen',  color: '#52c41a' },
  { key: 'purple', labelKey: 'settings.colorPurple', color: '#722ed1' },
  { key: 'orange', labelKey: 'settings.colorOrange', color: '#fa8c16' },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { mode, setMode, color, setColor } = useThemeContext();

  const handleResetDemo = () => {
    Modal.confirm({
      title: t('settings.resetConfirmTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('settings.resetConfirmDesc'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => {
        localStorage.removeItem('pto-auth');
        localStorage.removeItem('pto-theme-mode');
        localStorage.removeItem('pto-theme-color');
        localStorage.removeItem('pto-lang');
        message.success(t('settings.resetSuccess'));
        setTimeout(() => window.location.reload(), 500);
      },
    });
  };

  return (
    <Space orientation="vertical" size={24} style={{ width: '100%', maxWidth: 720 }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>{t('settings.title')}</Title>
        <Text type="secondary">{t('settings.subtitle')}</Text>
      </div>

      {/* Theme */}
      <Card title={<><BulbOutlined /> {t('settings.theme')}</>}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>{mode === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}</Text>
            <Switch
              checked={mode === 'dark'}
              onChange={checked => setMode(checked ? 'dark' : 'light')}
              checkedChildren={t('settings.darkMode')}
              unCheckedChildren={t('settings.lightMode')}
            />
          </div>
        </Space>
      </Card>

      {/* Primary Color */}
      <Card title={<><BgColorsOutlined /> {t('settings.primaryColor')}</>}>
        <div style={{ display: 'flex', gap: 12 }}>
          {COLOR_OPTIONS.map(opt => (
            <div
              key={opt.key}
              onClick={() => setColor(opt.key)}
              style={{
                width: 48, height: 48, borderRadius: 8,
                background: opt.color,
                cursor: 'pointer',
                border: color === opt.key ? '3px solid #fff' : '3px solid transparent',
                boxShadow: color === opt.key ? `0 0 0 2px ${opt.color}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              {color === opt.key && <Text style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>✓</Text>}
            </div>
          ))}
        </div>
        <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
          {t('settings.selected')}{t(COLOR_OPTIONS.find(c => c.key === color)?.labelKey || 'settings.colorBlue')}
        </Text>
      </Card>

      {/* Language */}
      <Card title={<><GlobalOutlined /> {t('settings.language')}</>}>
        <Radio.Group
          value={i18n.language}
          onChange={e => {
            i18n.changeLanguage(e.target.value);
            localStorage.setItem('pto-lang', e.target.value);
          }}
        >
          <Radio.Button value="en">English</Radio.Button>
          <Radio.Button value="zh">{t('settings.chinese')}</Radio.Button>
        </Radio.Group>
      </Card>

      {/* API Configuration */}
      <Card title={<><ApiOutlined /> {t('settings.apiConfig')}</>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('settings.apiBaseUrl')}>
            <Text code>{API_BASE}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('settings.proxyTarget')}>
            <Text code>http://localhost:8765</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('settings.status')}>
            <Tag color="green">{t('settings.connected')}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Auth info */}
      <Card title={<><SafetyOutlined /> {t('settings.authPermissions')}</>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('settings.authProvider')}>{t('settings.mockAuth')}</Descriptions.Item>
          <Descriptions.Item label={t('settings.currentRole')}>admin</Descriptions.Item>
          <Descriptions.Item label={t('settings.permissions')}>{t('settings.fullAccess')}</Descriptions.Item>
        </Descriptions>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('settings.rolesHint')}
        </Text>
      </Card>

      {/* About */}
      <Card title={<><InfoCircleOutlined /> {t('settings.about')}</>}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('settings.productLabel')}>Prompt-to-Ontology</Descriptions.Item>
          <Descriptions.Item label={t('settings.demoLabel')}>{t('app.demo')}</Descriptions.Item>
          <Descriptions.Item label={t('settings.version')}>1.0.0</Descriptions.Item>
          <Descriptions.Item label={t('settings.stack')}>React + Refine + Ant Design + FastAPI + Neo4j</Descriptions.Item>
          <Descriptions.Item label={t('settings.repository')}>
            <Link href="https://github.com/wenhaoyu-bryan/Prompt-to-Ontology" target="_blank">
              GitHub
            </Link>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Demo Reset */}
      <Card title={<><DeleteOutlined /> {t('settings.dangerZone')}</>}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text>{t('settings.resetDemo')}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{t('settings.resetDemoHint')}</Text>
          </div>
          <Button danger icon={<DeleteOutlined />} onClick={handleResetDemo}>
            {t('settings.reset')}
          </Button>
        </div>
      </Card>
    </Space>
  );
}
