import React from 'react';
import { Space, Typography, Tag, theme } from 'antd';

const { Title, Text } = Typography;

export default function PageHeader({
  title,
  subtitle,
  tag,
  tagColor,
  extra,
  style
}) {
  const { token } = theme.useToken();

  return (
    <div style={{
      marginBottom: 24,
      paddingBottom: 16,
      borderBottom: `1px solid ${token.colorBorderSecondary}`,
      ...style
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Space size={12} align="center">
            <Title level={4} style={{ margin: 0 }}>{title}</Title>
            {tag && <Tag color={tagColor || 'blue'}>{tag}</Tag>}
          </Space>
          {subtitle && (
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 14 }}>
              {subtitle}
            </Text>
          )}
        </div>
        {extra && <div>{extra}</div>}
      </div>
    </div>
  );
}
