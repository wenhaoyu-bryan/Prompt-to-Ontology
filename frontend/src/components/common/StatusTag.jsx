import React from 'react';
import { Tag } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  SyncOutlined, StopOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';

const STATUS_CONFIG = {
  pending: { color: 'default', icon: <ClockCircleOutlined /> },
  running: { color: 'processing', icon: <SyncOutlined spin /> },
  completed: { color: 'success', icon: <CheckCircleOutlined /> },
  success: { color: 'success', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', icon: <CloseCircleOutlined /> },
  error: { color: 'error', icon: <CloseCircleOutlined /> },
  skipped: { color: 'warning', icon: <StopOutlined /> },
  warning: { color: 'warning', icon: <ExclamationCircleOutlined /> },
  active: { color: 'processing', icon: <SyncOutlined /> },
  applied: { color: 'success', icon: <CheckCircleOutlined /> },
  rejected: { color: 'error', icon: <CloseCircleOutlined /> },
  approved: { color: 'success', icon: <CheckCircleOutlined /> },
};

export default function StatusTag({ status, children, ...props }) {
  const config = STATUS_CONFIG[status] || { color: 'default', icon: null };
  return (
    <Tag color={config.color} icon={config.icon} {...props}>
      {children || status}
    </Tag>
  );
}
