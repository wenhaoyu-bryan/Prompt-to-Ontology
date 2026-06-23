import React from 'react';
import { Empty, Spin, Result, Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

export function LoadingState({ tip }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <Spin size="large" tip={tip} />
    </div>
  );
}

export function EmptyState({ description, action, actionText }) {
  return (
    <Empty
      description={description || 'No data'}
      style={{ padding: 40 }}
    >
      {action && <Button type="primary" onClick={action}>{actionText || 'Get Started'}</Button>}
    </Empty>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <Result
      status="warning"
      title="Something went wrong"
      subTitle={error || 'An error occurred while loading data.'}
      extra={onRetry && (
        <Button icon={<ReloadOutlined />} onClick={onRetry}>Retry</Button>
      )}
    />
  );
}
