import React from 'react';
import { Card, Space, Typography, theme } from 'antd';

const { Text, Title } = Typography;

export default function MetricCard({
  icon,
  label,
  value,
  suffix,
  onClick,
  style
}) {
  const { token } = theme.useToken();

  return (
    <Card
      size="small"
      hoverable={!!onClick}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {icon && <span style={{ color: token.colorPrimary, fontSize: 18 }}>{icon}</span>}
          <Title level={3} style={{ margin: 0 }}>{value}</Title>
          {suffix && <Text type="secondary" style={{ fontSize: 12 }}>{suffix}</Text>}
        </div>
      </Space>
    </Card>
  );
}
