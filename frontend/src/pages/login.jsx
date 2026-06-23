import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useLogin } from '@refinedev/core';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { t } = useTranslation();
  const { mutate: login, isLoading } = useLogin();
  const [error, setError] = useState(null);

  const onFinish = (values) => {
    setError(null);
    login(values, {
      onError: (err) => setError(err?.error?.message || t('auth.loginError')),
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
    }}>
      <Card style={{ width: 380, borderRadius: 12 }} variant="borderless">
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 32, textAlign: 'center' }}>
          <img
            src="/project_profile.png"
            alt="Logo"
            style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px', display: 'block' }}
          />
          <Title level={4} style={{ margin: 0 }}>{t('auth.loginTitle')}</Title>
          <Text type="secondary">{t('auth.loginSubtitle')}</Text>
        </Space>

        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'demo', password: 'demo' }}>
          <Form.Item name="username" rules={[{ required: true, message: t('auth.username') }]}>
            <Input prefix={<UserOutlined />} placeholder={t('auth.username')} size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('auth.password') }]}>
            <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password')} size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={isLoading} block size="large">
              {t('auth.loginButton')}
            </Button>
          </Form.Item>
        </Form>

        <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
          {t('auth.demoHint')}
        </Text>
      </Card>
    </div>
  );
}
