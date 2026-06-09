import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Typography, Tabs, Empty, Button, message, Popconfirm, Drawer, Descriptions, Row, Col, Statistic, Alert } from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  EditOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  BugOutlined,
  FileSearchOutlined,
  PlusCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../providers/dataProvider';
import { MOCK_REVIEW_ITEMS } from '../mocks/reviewItems';

const { Title, Text, Paragraph } = Typography;

const TYPE_ICONS = {
  low_confidence: <BugOutlined />,
  conflicting_property: <WarningOutlined />,
  new_relationship: <PlusCircleOutlined />,
  missing_evidence: <FileSearchOutlined />,
  new_object: <ExclamationCircleOutlined />,
};

const STATUS_COLORS = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
};

const SEVERITY_COLORS = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue',
};

export default function ReviewQueuePage() {
  const { t } = useTranslation();
  const [violations, setViolations] = useState([]);
  const [reviewItems, setReviewItems] = useState(MOCK_REVIEW_ITEMS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  const loadViolations = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ontology/violations');
      setViolations(data.violations || []);
    } catch {
      setViolations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadViolations(); }, []);

  // Combine backend violations with mock review items
  const allItems = [
    ...violations.map((v, i) => ({
      id: `violation-${i}`,
      type: 'rule_violation',
      title: v.rule_name || v.rule_id,
      description: v.description || '',
      source: t('review.ruleEngine'),
      severity: v.severity || 'medium',
      status: v.status || 'pending',
      rule_id: v.rule_id,
      product_name: v.product_name || v.product_id,
      isMock: false,
    })),
    ...reviewItems.map(item => ({ ...item, isMock: true })),
  ];

  const pending = allItems.filter(v => v.status === 'pending' || !v.status);
  const approved = allItems.filter(v => v.status === 'approved');
  const rejected = allItems.filter(v => v.status === 'rejected');

  const handleAction = (id, action) => {
    setReviewItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: action } : item
    ));
    const labels = { approved: t('review.approved'), rejected: t('review.rejected') };
    message.success(`${labels[action] || action}`);
    setDetailDrawerOpen(false);
  };

  const handleViewDetail = (item) => {
    setSelectedItem(item);
    setDetailDrawerOpen(true);
  };

  const getActionButtons = (record) => {
    if (record.status && record.status !== 'pending') return null;
    const isViolation = record.id?.startsWith('violation-');
    return (
      <Space size={4}>
        {!isViolation && (
          <Popconfirm
            title={t('review.confirmApprove')}
            onConfirm={() => handleAction(record.id, 'approved')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" type="text" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} />
          </Popconfirm>
        )}
        {!isViolation && (
          <Popconfirm
            title={t('review.confirmReject')}
            onConfirm={() => handleAction(record.id, 'rejected')}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" type="text" icon={<CloseCircleOutlined />} danger />
          </Popconfirm>
        )}
        <Button size="small" type="text" icon={<RobotOutlined />} onClick={() => message.info(t('review.sentToAgent'))} />
      </Space>
    );
  };

  const columns = [
    {
      title: '',
      key: 'icon',
      width: 32,
      render: (_, record) => TYPE_ICONS[record.type] || <ExclamationCircleOutlined />,
    },
    {
      title: t('common.name'),
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Space orientation="vertical" size={2}>
          <Space size={4}>
            <Text style={{ fontSize: 13 }}>{text}</Text>
            {record.isMock && <Tag style={{ fontSize: 9 }}>{t('common.prototype')}</Tag>}
          </Space>
          {record.product_name && (
            <Text type="secondary" style={{ fontSize: 11 }}>{record.product_name}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('review.itemType'),
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type) => <Tag>{t(`review.types.${type}`, type)}</Tag>,
    },
    {
      title: t('common.severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 90,
      render: (s) => <Tag color={SEVERITY_COLORS[s] || 'default'}>{s ? t(`common.statusLabels.${s}`, s) : '—'}</Tag>,
    },
    {
      title: t('review.source'),
      dataIndex: 'source',
      key: 'source',
      width: 120,
      ellipsis: true,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const s = status || 'pending';
        const color = STATUS_COLORS[s];
        const icon = s === 'approved' ? <CheckCircleOutlined /> : s === 'rejected' ? <CloseCircleOutlined /> : <ClockCircleOutlined />;
        return <Tag icon={icon} color={color}>{t(`common.statusLabels.${s}`, s)}</Tag>;
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 100,
      render: (_, record) => getActionButtons(record),
    },
  ];

  const tabItems = [
    {
      key: 'pending',
      label: <span><ClockCircleOutlined /> {t('review.pending')} ({pending.length})</span>,
      children: (
        <Table
          dataSource={pending}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          onRow={(record) => ({
            onClick: () => handleViewDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      ),
    },
    {
      key: 'approved',
      label: <span><CheckCircleOutlined /> {t('review.approved')} ({approved.length})</span>,
      children: (
        <Table
          dataSource={approved}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          onRow={(record) => ({
            onClick: () => handleViewDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      ),
    },
    {
      key: 'rejected',
      label: <span><CloseCircleOutlined /> {t('review.rejected')} ({rejected.length})</span>,
      children: (
        <Table
          dataSource={rejected}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          onRow={(record) => ({
            onClick: () => handleViewDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('review.title')}</Title>
          <Text type="secondary">{t('review.subtitle')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadViolations}>{t('common.refresh')}</Button>
      </div>

      {/* HITL Note */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t('review.hitlNote')}
        style={{ fontSize: 12 }}
      />

      {/* Summary Stats */}
      <Row gutter={[16, 16]}>
        {[
          { title: t('review.pending'), value: pending.length, icon: <ClockCircleOutlined />, color: '#fa8c16' },
          { title: t('review.approved'), value: approved.length, icon: <CheckCircleOutlined />, color: '#52c41a' },
          { title: t('review.rejected'), value: rejected.length, icon: <CloseCircleOutlined />, color: '#ff4d4f' },
        ].map((s, i) => (
          <Col xs={8} key={i}>
            <Card size="small" hoverable>
              <Statistic
                title={s.title}
                value={s.value}
                prefix={React.cloneElement(s.icon, { style: { color: s.color } })}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Tabbed content */}
      <Card styles={{ body: { padding: '0 16px 16px' } }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginTop: 8 }} />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={selectedItem?.title || t('common.detail')}
        open={detailDrawerOpen}
        onClose={() => { setDetailDrawerOpen(false); setSelectedItem(null); }}
        size={480}
      >
        {selectedItem && (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('review.itemType')}>
                <Tag>{t(`review.types.${selectedItem.type}`, selectedItem.type)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.severity')}>
                <Tag color={SEVERITY_COLORS[selectedItem.severity]}>{t(`common.statusLabels.${selectedItem.severity}`, selectedItem.severity)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={STATUS_COLORS[selectedItem.status || 'pending']}>{selectedItem.status || 'pending'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('review.source')}>{selectedItem.source}</Descriptions.Item>
              {selectedItem.product_name && (
                <Descriptions.Item label={t('common.product')}>{selectedItem.product_name}</Descriptions.Item>
              )}
              {selectedItem.rule_id && (
                <Descriptions.Item label={t('common.rule')}><Text code>{selectedItem.rule_id}</Text></Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title={t('common.description')} variant="inner">
              <Paragraph style={{ margin: 0 }}>{selectedItem.description}</Paragraph>
            </Card>

            {selectedItem.suggested_action && (
              <Card size="small" title={t('review.suggestedAction')} variant="inner">
                <Text>{selectedItem.suggested_action}</Text>
              </Card>
            )}

            {/* Action buttons */}
            {(!selectedItem.status || selectedItem.status === 'pending') && !selectedItem.id?.startsWith('violation-') && (
              <Card size="small" variant="inner">
                <Space>
                  <Popconfirm
                    title={t('review.confirmApprove')}
                    onConfirm={() => handleAction(selectedItem.id, 'approved')}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                  >
                    <Button type="primary" icon={<CheckCircleOutlined />}>{t('review.approve')}</Button>
                  </Popconfirm>
                  <Popconfirm
                    title={t('review.confirmReject')}
                    onConfirm={() => handleAction(selectedItem.id, 'rejected')}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                  >
                    <Button danger icon={<CloseCircleOutlined />}>{t('review.reject')}</Button>
                  </Popconfirm>
                  <Button icon={<RobotOutlined />} onClick={() => message.info(t('review.sentToAgent'))}>
                    {t('review.sendToAgent')}
                  </Button>
                </Space>
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
