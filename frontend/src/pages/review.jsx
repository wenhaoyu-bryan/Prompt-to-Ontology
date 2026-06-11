import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Space, Typography, Tabs, Empty, Button, message, Popconfirm, Drawer, Descriptions, Row, Col, Statistic, Alert } from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  BugOutlined,
  FileSearchOutlined,
  PlusCircleOutlined,
  InfoCircleOutlined,
  SendOutlined,
  CheckOutlined,
  UndoOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;

const TYPE_ICONS = {
  IMPORT_OBJECT_CANDIDATE: <PlusCircleOutlined />,
  IMPORT_LINK_CANDIDATE: <FileSearchOutlined />,
  PROPERTY_CONFLICT: <WarningOutlined />,
  VALIDATION_WARNING: <BugOutlined />,
  RULE_TRIGGERED_ACTION: <ExclamationCircleOutlined />,
  AGENT_SUGGESTION: <RobotOutlined />,
  // Legacy types for rule violations
  low_confidence: <BugOutlined />,
  conflicting_property: <WarningOutlined />,
  new_relationship: <PlusCircleOutlined />,
  missing_evidence: <FileSearchOutlined />,
  new_object: <ExclamationCircleOutlined />,
  rule_violation: <ExclamationCircleOutlined />,
};

const STATUS_COLORS = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
  applied: 'blue',
  failed: 'volcano',
};

const SEVERITY_COLORS = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue',
  info: 'default',
};

export default function ReviewQueuePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const batchIdFilter = searchParams.get('batch_id');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  const loadReviewData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (batchIdFilter) params.batch_id = batchIdFilter;
      const [itemsRes, summaryRes] = await Promise.all([
        api.get('/review/items', { params }),
        api.get('/review/summary'),
      ]);
      setItems(itemsRes.data.items || []);
      setSummary(summaryRes.data);
    } catch {
      setItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [batchIdFilter]);

  const loadViolations = async () => {
    try {
      const { data } = await api.get('/ontology/violations');
      setViolations(data.violations || []);
    } catch {
      setViolations([]);
    }
  };

  useEffect(() => {
    loadReviewData();
    loadViolations();
  }, [loadReviewData]);

  // Combine review items with rule violations
  const violationItems = violations.map((v, i) => ({
    id: `violation-${i}`,
    type: 'rule_violation',
    title: v.rule_name || v.rule_id,
    description: v.description || '',
    source: t('review.ruleEngine'),
    severity: v.severity || 'medium',
    status: v.status || 'pending',
    isViolation: true,
  }));

  const allItems = [...items, ...violationItems];
  const pending = allItems.filter(v => v.status === 'pending');
  const approved = allItems.filter(v => v.status === 'approved');
  const rejected = allItems.filter(v => v.status === 'rejected');
  const applied = allItems.filter(v => v.status === 'applied');
  const failed = allItems.filter(v => v.status === 'failed');

  const handleApprove = async (itemId) => {
    try {
      await api.post(`/review/items/${itemId}/approve`, { reason: '', reviewed_by: 'demo_user' });
      message.success(t('review.approved'));
      loadReviewData();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    }
    setDetailDrawerOpen(false);
  };

  const handleReject = async (itemId) => {
    try {
      await api.post(`/review/items/${itemId}/reject`, { reason: '', reviewed_by: 'demo_user' });
      message.success(t('review.rejected'));
      loadReviewData();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    }
    setDetailDrawerOpen(false);
  };

  const handleApply = async (itemId) => {
    try {
      const { data } = await api.post(`/review/items/${itemId}/apply`);
      if (data.applied) {
        message.success(t('review.appliedSuccess'));
      } else {
        message.error(data.error || t('review.applyFailed'));
      }
      loadReviewData();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('review.applyFailed'));
    }
    setDetailDrawerOpen(false);
  };

  const handleApplyBatch = async () => {
    if (!batchIdFilter) return;
    try {
      const { data } = await api.post(`/review/batches/${batchIdFilter}/apply-approved`);
      const successCount = data.results?.filter(r => r.applied).length || 0;
      const failCount = data.results?.filter(r => !r.applied).length || 0;
      if (successCount > 0) message.success(t('review.batchApplied', { count: successCount }));
      if (failCount > 0) message.warning(t('review.batchApplyFailed', { count: failCount }));
      loadReviewData();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('review.applyFailed'));
    }
  };

  const handleViewDetail = (item) => {
    setSelectedItem(item);
    setDetailDrawerOpen(true);
  };

  const getActionButtons = (record) => {
    if (record.isViolation) return null;

    if (record.status === 'pending') {
      return (
        <Space size={4}>
          <Popconfirm
            title={t('review.confirmApprove')}
            onConfirm={() => handleApprove(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" type="text" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} />
          </Popconfirm>
          <Popconfirm
            title={t('review.confirmReject')}
            onConfirm={() => handleReject(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" type="text" icon={<CloseCircleOutlined />} danger />
          </Popconfirm>
        </Space>
      );
    }

    if (record.status === 'approved') {
      return (
        <Popconfirm
          title={t('review.confirmApply')}
          onConfirm={() => handleApply(record.id)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button size="small" type="primary" icon={<RocketOutlined />}>{t('review.apply')}</Button>
        </Popconfirm>
      );
    }

    if (record.status === 'failed') {
      return (
        <Popconfirm
          title={t('review.confirmApply')}
          onConfirm={() => handleApply(record.id)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button size="small" icon={<UndoOutlined />}>{t('review.retryApply')}</Button>
        </Popconfirm>
      );
    }

    return null;
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
          <Text style={{ fontSize: 13 }}>{text}</Text>
          {record.source_plan_id && (
            <Text type="secondary" style={{ fontSize: 10 }}>plan: {record.source_plan_id}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('review.itemType'),
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (type) => <Tag>{type?.replace(/_/g, ' ') || '—'}</Tag>,
    },
    {
      title: t('common.severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 90,
      render: (s) => <Tag color={SEVERITY_COLORS[s] || 'default'}>{s || '—'}</Tag>,
    },
    {
      title: t('review.source'),
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (s) => <Tag>{s || '—'}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const s = status || 'pending';
        const icon = s === 'applied' ? <CheckCircleOutlined /> : s === 'approved' ? <CheckOutlined /> : s === 'rejected' ? <CloseCircleOutlined /> : s === 'failed' ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />;
        return <Tag icon={icon} color={STATUS_COLORS[s]}>{s}</Tag>;
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      render: (_, record) => getActionButtons(record),
    },
  ];

  const makeTab = (key, label, data) => ({
    key,
    label: <span>{label} ({data.length})</span>,
    children: (
      <Table
        dataSource={data}
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
  });

  const tabItems = [
    makeTab('pending', <span><ClockCircleOutlined /> {t('review.pending')}</span>, pending),
    makeTab('approved', <span><CheckOutlined /> {t('review.approved')}</span>, approved),
    makeTab('rejected', <span><CloseCircleOutlined /> {t('review.rejected')}</span>, rejected),
    makeTab('applied', <span><CheckCircleOutlined /> {t('review.applied') || 'Applied'}</span>, applied),
    makeTab('failed', <span><ExclamationCircleOutlined /> {t('review.failed') || 'Failed'}</span>, failed),
  ];

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('review.title')}</Title>
          <Text type="secondary">{t('review.subtitle')}</Text>
        </div>
        <Space>
          {batchIdFilter && approved.length > 0 && (
            <Button type="primary" icon={<RocketOutlined />} onClick={handleApplyBatch}>
              {t('review.applyAllApproved')}
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadReviewData}>{t('common.refresh')}</Button>
        </Space>
      </div>

      {/* Batch filter indicator */}
      {batchIdFilter && (
        <Alert
          type="info"
          showIcon
          message={t('review.showingBatch', { batchId: batchIdFilter })}
          action={
            <Button size="small" href="/review">{t('review.showAll')}</Button>
          }
        />
      )}

      {/* HITL Note */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        title={t('review.hitlNote')}
        style={{ fontSize: 12 }}
      />

      {/* Summary Stats */}
      <Row gutter={[16, 16]}>
        {[
          { title: t('review.pending'), value: summary?.pending ?? pending.length, icon: <ClockCircleOutlined />, color: '#fa8c16' },
          { title: t('review.approved'), value: summary?.approved ?? approved.length, icon: <CheckOutlined />, color: '#52c41a' },
          { title: t('review.applied') || 'Applied', value: summary?.applied ?? applied.length, icon: <CheckCircleOutlined />, color: '#1677ff' },
          { title: t('review.failed') || 'Failed', value: summary?.failed ?? failed.length, icon: <ExclamationCircleOutlined />, color: '#ff4d4f' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}>
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
                <Tag>{selectedItem.type?.replace(/_/g, ' ')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.severity')}>
                <Tag color={SEVERITY_COLORS[selectedItem.severity]}>{selectedItem.severity}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={STATUS_COLORS[selectedItem.status]}>{selectedItem.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('review.source')}>{selectedItem.source}</Descriptions.Item>
              {selectedItem.source_plan_id && (
                <Descriptions.Item label="Plan ID"><Text code>{selectedItem.source_plan_id}</Text></Descriptions.Item>
              )}
              {selectedItem.reviewed_by && (
                <Descriptions.Item label={t('review.reviewedBy') || 'Reviewed By'}>{selectedItem.reviewed_by}</Descriptions.Item>
              )}
              {selectedItem.decision_reason && (
                <Descriptions.Item label={t('review.decisionReason') || 'Reason'}>{selectedItem.decision_reason}</Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title={t('common.description')} variant="inner">
              <Paragraph style={{ margin: 0 }}>{selectedItem.description}</Paragraph>
            </Card>

            {/* Candidate object/link details */}
            {selectedItem.candidate_object && (
              <Card size="small" title={t('review.candidateObject') || 'Candidate Object'} variant="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="ID"><Text code>{selectedItem.candidate_object.id}</Text></Descriptions.Item>
                  <Descriptions.Item label={t('common.type')}><Tag color="blue">{selectedItem.candidate_object.type}</Tag></Descriptions.Item>
                  <Descriptions.Item label={t('pipeline.confidence')}>{((selectedItem.candidate_object.confidence || 0) * 100).toFixed(0)}%</Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {selectedItem.candidate_link && (
              <Card size="small" title={t('review.candidateLink') || 'Candidate Link'} variant="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t('pipeline.sourceId')}><Text code>{selectedItem.candidate_link.source_id}</Text></Descriptions.Item>
                  <Descriptions.Item label={t('common.type')}><Tag color="green">{selectedItem.candidate_link.type}</Tag></Descriptions.Item>
                  <Descriptions.Item label={t('pipeline.targetId')}><Text code>{selectedItem.candidate_link.target_id}</Text></Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* Apply error */}
            {selectedItem.apply_error && (
              <Alert type="error" showIcon message={t('review.applyError') || 'Apply Error'} description={selectedItem.apply_error} />
            )}

            {/* Action buttons */}
            {!selectedItem.isViolation && (
              <Card size="small" variant="inner">
                <Space>
                  {selectedItem.status === 'pending' && (
                    <>
                      <Popconfirm title={t('review.confirmApprove')} onConfirm={() => handleApprove(selectedItem.id)}>
                        <Button type="primary" icon={<CheckCircleOutlined />}>{t('review.approve')}</Button>
                      </Popconfirm>
                      <Popconfirm title={t('review.confirmReject')} onConfirm={() => handleReject(selectedItem.id)}>
                        <Button danger icon={<CloseCircleOutlined />}>{t('review.reject')}</Button>
                      </Popconfirm>
                    </>
                  )}
                  {selectedItem.status === 'approved' && (
                    <Popconfirm title={t('review.confirmApply')} onConfirm={() => handleApply(selectedItem.id)}>
                      <Button type="primary" icon={<RocketOutlined />}>{t('review.apply')}</Button>
                    </Popconfirm>
                  )}
                  {selectedItem.status === 'failed' && (
                    <Popconfirm title={t('review.confirmApply')} onConfirm={() => handleApply(selectedItem.id)}>
                      <Button icon={<UndoOutlined />}>{t('review.retryApply')}</Button>
                    </Popconfirm>
                  )}
                </Space>
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
