import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Space, Typography, Tabs, Button, message, Drawer,
  Descriptions, Row, Col, Statistic, Alert, Timeline, Modal, Input, theme,
} from 'antd';
import {
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
  CheckOutlined,
  UndoOutlined,
  RocketOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../providers/dataProvider';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const TYPE_ICONS = {
  IMPORT_OBJECT_CANDIDATE: <PlusCircleOutlined />,
  IMPORT_LINK_CANDIDATE: <FileSearchOutlined />,
  PROPERTY_CONFLICT: <WarningOutlined />,
  VALIDATION_WARNING: <BugOutlined />,
  RULE_TRIGGERED_ACTION: <ExclamationCircleOutlined />,
  AGENT_SUGGESTION: <RobotOutlined />,
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

function formatTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

export default function ReviewQueuePage() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [searchParams] = useSearchParams();
  const batchIdFilter = searchParams.get('batch_id');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Reason modal state
  const [reasonModal, setReasonModal] = useState({ open: false, action: null, itemId: null, reason: '' });

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

      // Load batch detail when filtering by batch_id
      if (batchIdFilter) {
        try {
          const { data } = await api.get(`/review/batches/${batchIdFilter}`);
          setBatchDetail(data);
        } catch (err) { console.warn('[Review] failed to load batch detail', err); setBatchDetail(null); }
      } else {
        setBatchDetail(null);
      }
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

  // ── Approve / Reject with reason modal ──────────────────────────────

  const openApproveModal = (itemId) => {
    setReasonModal({ open: true, action: 'approve', itemId, reason: '' });
  };

  const openRejectModal = (itemId) => {
    setReasonModal({ open: true, action: 'reject', itemId, reason: '' });
  };

  const handleReasonSubmit = async () => {
    const { action, itemId, reason } = reasonModal;
    if (action === 'reject' && !reason.trim()) {
      message.warning(t('review.rejectReasonRequired'));
      return;
    }
    try {
      const endpoint = action === 'approve' ? 'approve' : 'reject';
      await api.post(`/review/items/${itemId}/${endpoint}`, {
        reason: reason.trim(),
        reviewed_by: 'demo_user',
      });
      message.success(action === 'approve' ? t('review.approved') : t('review.rejected'));
      loadReviewData();
    } catch (err) {
      message.error(err?.response?.data?.detail || t('common.error'));
    }
    setReasonModal({ open: false, action: null, itemId: null, reason: '' });
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

  // ── Build timeline for drawer ───────────────────────────────────────

  const buildTimeline = (item) => {
    const dots = [];
    dots.push({
      color: 'blue',
      children: (
        <div>
          <Text strong>{t('review.timelineCreated')}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(item.created_at)}</Text>
        </div>
      ),
    });

    if (item.status === 'approved' || item.status === 'applied') {
      dots.push({
        color: 'green',
        children: (
          <div>
            <Text strong>{t('review.timelineApproved')}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatTime(item.reviewed_at)}
              {item.reviewed_by && ` · ${item.reviewed_by}`}
            </Text>
            {item.decision_reason && (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>"{item.decision_reason}"</Text>
              </>
            )}
          </div>
        ),
      });
    }

    if (item.status === 'rejected') {
      dots.push({
        color: 'red',
        children: (
          <div>
            <Text strong>{t('review.timelineRejected')}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatTime(item.reviewed_at)}
              {item.reviewed_by && ` · ${item.reviewed_by}`}
            </Text>
            {item.decision_reason && (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>"{item.decision_reason}"</Text>
              </>
            )}
          </div>
        ),
      });
    }

    if (item.status === 'applied') {
      dots.push({
        color: 'blue',
        children: (
          <div>
            <Text strong>{t('review.timelineApplied')}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(item.applied_at)}</Text>
          </div>
        ),
      });
    }

    if (item.status === 'failed') {
      dots.push({
        color: 'volcano',
        children: (
          <div>
            <Text strong>{t('review.timelineFailed')}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(item.updated_at)}</Text>
            {item.apply_error && (
              <>
                <br />
                <Text type="danger" style={{ fontSize: 12 }}>{item.apply_error}</Text>
              </>
            )}
          </div>
        ),
      });
    }

    return dots;
  };

  // ── Action buttons ──────────────────────────────────────────────────

  const getActionButtons = (record) => {
    if (record.isViolation) return null;

    if (record.status === 'pending') {
      return (
        <Space size={4}>
          <Button size="small" type="text" icon={<CheckCircleOutlined />}
            style={{ color: token.colorSuccess }}
            onClick={(e) => { e.stopPropagation(); openApproveModal(record.id); }}
          />
          <Button size="small" type="text" icon={<CloseCircleOutlined />} danger
            onClick={(e) => { e.stopPropagation(); openRejectModal(record.id); }}
          />
        </Space>
      );
    }

    if (record.status === 'approved') {
      return (
        <Button size="small" type="primary" icon={<RocketOutlined />}
          onClick={(e) => { e.stopPropagation(); handleApply(record.id); }}
        >
          {t('review.apply')}
        </Button>
      );
    }

    if (record.status === 'failed') {
      return (
        <Button size="small" icon={<UndoOutlined />}
          onClick={(e) => { e.stopPropagation(); handleApply(record.id); }}
        >
          {t('review.retryApply')}
        </Button>
      );
    }

    return null;
  };

  // ── Table columns ───────────────────────────────────────────────────

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
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 13 }}>{text}</Text>
          {record.source_plan_id && (
            <Text type="secondary" style={{ fontSize: 12 }}>{t('pipeline.planId', 'Plan ID')}: {record.source_plan_id}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('review.itemType'),
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type) => <Tag>{t('review.types.' + (type || ''), type?.replace(/_/g, ' ') || '—')}</Tag>,
    },
    {
      title: t('common.severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (s) => <Tag color={SEVERITY_COLORS[s] || 'default'}>{t('ruleStudio.severity.' + s, s) || '—'}</Tag>,
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => {
        const s = status || 'pending';
        const icon = s === 'applied' ? <CheckCircleOutlined /> : s === 'approved' ? <CheckOutlined /> : s === 'rejected' ? <CloseCircleOutlined /> : s === 'failed' ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />;
        return <Tag icon={icon} color={STATUS_COLORS[s]}>{t(`common.statusLabels.${s}`, s)}</Tag>;
      },
    },
    {
      title: t('review.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (ts) => <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(ts)}</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 100,
      render: (_, record) => getActionButtons(record),
    },
  ];

  // ── Tabs ────────────────────────────────────────────────────────────

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
        scroll={{ x: 800 }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
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
    makeTab('applied', <span><CheckCircleOutlined /> {t('review.applied')}</span>, applied),
    makeTab('failed', <span><ExclamationCircleOutlined /> {t('review.failed')}</span>, failed),
  ];

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
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

      {/* Approve vs Apply distinction */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t('review.approveVsApply')}
        style={{ fontSize: 12 }}
      />

      {/* Batch summary when batch_id is present */}
      {batchIdFilter && batchDetail && (
        <Card size="small">
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Space>
                <Text strong>{t('review.batchLabel')}:</Text>
                <Text code>{batchIdFilter}</Text>
                {batchDetail.title && <Text type="secondary">— {batchDetail.title}</Text>}
              </Space>
            </Col>
            <Col>
              <Space size={16}>
                <Statistic title={t('review.pending')} value={batchDetail.pending_count || 0} valueStyle={{ fontSize: 16, color: token.colorWarning }} />
                <Statistic title={t('review.approved')} value={batchDetail.approved_count || 0} valueStyle={{ fontSize: 16, color: token.colorSuccess }} />
                <Statistic title={t('review.rejected')} value={batchDetail.rejected_count || 0} valueStyle={{ fontSize: 16, color: token.colorError }} />
                <Statistic title={t('review.applied')} value={batchDetail.applied_count || 0} valueStyle={{ fontSize: 16, color: token.colorPrimary }} />
                <Statistic title={t('review.failed')} value={batchDetail.failed_count || 0} valueStyle={{ fontSize: 16, color: batchDetail.failed_count > 0 ? token.colorError : undefined }} />
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* Global summary stats */}
      <Row gutter={[12, 12]}>
        {[
          { title: t('review.pending'), value: summary?.pending ?? pending.length, icon: <ClockCircleOutlined />, color: token.colorWarning },
          { title: t('review.approved'), value: summary?.approved ?? approved.length, icon: <CheckOutlined />, color: token.colorSuccess },
          { title: t('review.applied'), value: summary?.applied ?? applied.length, icon: <CheckCircleOutlined />, color: token.colorPrimary },
          { title: t('review.failed'), value: summary?.failed ?? failed.length, icon: <ExclamationCircleOutlined />, color: token.colorError },
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

      {/* ── Detail Drawer ────────────────────────────────────────────── */}
      <Drawer
        title={selectedItem?.title || t('common.detail')}
        open={detailDrawerOpen}
        onClose={() => { setDetailDrawerOpen(false); setSelectedItem(null); }}
        size={520}
      >
        {selectedItem && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Basic info */}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('review.itemType')}>
                <Tag>{t('review.types.' + (selectedItem.type || ''), selectedItem.type?.replace(/_/g, ' ') || '')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.severity')}>
                <Tag color={SEVERITY_COLORS[selectedItem.severity]}>{t('ruleStudio.severity.' + (selectedItem.severity || ''), selectedItem.severity || '—')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common.status')}>
                <Tag color={STATUS_COLORS[selectedItem.status]}>{t(`common.statusLabels.${selectedItem.status}`, selectedItem.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('review.source')}>
                <Tag>{selectedItem.source}</Tag>
              </Descriptions.Item>
              {selectedItem.source_plan_id && (
                <Descriptions.Item label={t('pipeline.planId', 'Plan ID')}><Text code>{selectedItem.source_plan_id}</Text></Descriptions.Item>
              )}
              {selectedItem.metadata?.agent_run_id && (
                <Descriptions.Item label={t('review.agentRunId')}><Text code>{selectedItem.metadata.agent_run_id}</Text></Descriptions.Item>
              )}
              {selectedItem.metadata?.user_message && (
                <Descriptions.Item label={t('review.originalMessage')}><Text style={{ fontSize: 12 }}>{selectedItem.metadata.user_message}</Text></Descriptions.Item>
              )}
              {selectedItem.metadata?.agent_action_type && (
                <Descriptions.Item label={t('review.agentActionType')}><Tag color="purple">{selectedItem.metadata.agent_action_type}</Tag></Descriptions.Item>
              )}
              {selectedItem.metadata?.reason && (
                <Descriptions.Item label={t('review.agentReason')}><Text style={{ fontSize: 12 }}>{selectedItem.metadata.reason}</Text></Descriptions.Item>
              )}
            </Descriptions>

            {/* Agent property update details */}
            {selectedItem.metadata?.property_update && (
              <Card size="small" title={t('review.propertyUpdate')} variant="inner">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={t('common.id')}><Text code>{selectedItem.metadata.property_update.object_id}</Text></Descriptions.Item>
                  <Descriptions.Item label={t('review.property')}><Text code>{selectedItem.metadata.property_update.property}</Text></Descriptions.Item>
                  <Descriptions.Item label={t('review.oldValue')}>{String(selectedItem.metadata.property_update.old_value ?? '—')}</Descriptions.Item>
                  <Descriptions.Item label={t('review.newValue')}><Text strong>{String(selectedItem.metadata.property_update.new_value)}</Text></Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* Audit timeline */}
            <Card size="small" title={t('review.auditTimeline')} variant="inner">
              <Timeline items={buildTimeline(selectedItem)} />
            </Card>

            {/* Description */}
            <Card size="small" title={t('common.description')} variant="inner">
              <Paragraph style={{ margin: 0, fontSize: 13 }}>{selectedItem.description}</Paragraph>
            </Card>

            {/* Candidate Object with properties table */}
            {selectedItem.candidate_object && (
              <Card size="small" title={t('review.candidateObject')} variant="inner">
                <Descriptions column={1} size="small" style={{ marginBottom: 8 }}>
                  <Descriptions.Item label={t('common.id')}><Text code>{selectedItem.candidate_object.id}</Text></Descriptions.Item>
                  <Descriptions.Item label={t('common.type')}><Tag color="blue">{selectedItem.candidate_object.type}</Tag></Descriptions.Item>
                  <Descriptions.Item label={t('pipeline.confidence')}>
                    {((selectedItem.candidate_object.confidence || 0) * 100).toFixed(0)}%
                  </Descriptions.Item>
                </Descriptions>
                {selectedItem.candidate_object.properties && Object.keys(selectedItem.candidate_object.properties).length > 0 && (
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: 400 }}
                    dataSource={Object.entries(selectedItem.candidate_object.properties).map(([k, v]) => ({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }))}
                    columns={[
                      { title: t('review.property'), dataIndex: 'key', key: 'key', width: 120, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
                      { title: t('common.detail'), dataIndex: 'value', key: 'value', ellipsis: true },
                    ]}
                  />
                )}
                {selectedItem.candidate_object.evidence && (
                  <Alert type="info" style={{ marginTop: 8 }} message={t('review.evidence')} description={selectedItem.candidate_object.evidence} />
                )}
              </Card>
            )}

            {/* Candidate Link with visual arrow */}
            {selectedItem.candidate_link && (
              <Card size="small" title={t('review.candidateLink')} variant="inner">
                <div style={{ textAlign: 'center', padding: '12px 0', background: token.colorBgLayout, borderRadius: 6, marginBottom: 12 }}>
                  <Space size={8} align="center">
                    <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>{selectedItem.candidate_link.source_id}</Tag>
                    <ArrowRightOutlined style={{ fontSize: 16, color: token.colorSuccess }} />
                    <Tag color="green" style={{ fontSize: 13, padding: '4px 12px' }}>{selectedItem.candidate_link.type}</Tag>
                    <ArrowRightOutlined style={{ fontSize: 16, color: token.colorSuccess }} />
                    <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>{selectedItem.candidate_link.target_id}</Tag>
                  </Space>
                </div>
                {selectedItem.candidate_link.confidence != null && (
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label={t('pipeline.confidence')}>
                      {((selectedItem.candidate_link.confidence || 0) * 100).toFixed(0)}%
                    </Descriptions.Item>
                  </Descriptions>
                )}
                {selectedItem.candidate_link.properties && Object.keys(selectedItem.candidate_link.properties).length > 0 && (
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: 400 }}
                    dataSource={Object.entries(selectedItem.candidate_link.properties).map(([k, v]) => ({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }))}
                    columns={[
                      { title: t('review.property'), dataIndex: 'key', key: 'key', width: 120, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
                      { title: t('common.detail'), dataIndex: 'value', key: 'value', ellipsis: true },
                    ]}
                  />
                )}
                {selectedItem.candidate_link.evidence && (
                  <Alert type="info" style={{ marginTop: 8 }} message={t('review.evidence')} description={selectedItem.candidate_link.evidence} />
                )}
              </Card>
            )}

            {/* Apply error */}
            {selectedItem.apply_error && (
              <Alert type="error" showIcon message={t('review.applyError')} description={selectedItem.apply_error} />
            )}

            {/* Action buttons */}
            {!selectedItem.isViolation && (
              <Card size="small" variant="inner">
                <Space>
                  {selectedItem.status === 'pending' && (
                    <>
                      <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => openApproveModal(selectedItem.id)}>
                        {t('review.approve')}
                      </Button>
                      <Button danger icon={<CloseCircleOutlined />} onClick={() => openRejectModal(selectedItem.id)}>
                        {t('review.reject')}
                      </Button>
                    </>
                  )}
                  {selectedItem.status === 'approved' && (
                    <Button type="primary" icon={<RocketOutlined />} onClick={() => handleApply(selectedItem.id)}>
                      {t('review.apply')}
                    </Button>
                  )}
                  {selectedItem.status === 'failed' && (
                    <Button icon={<UndoOutlined />} onClick={() => handleApply(selectedItem.id)}>
                      {t('review.retryApply')}
                    </Button>
                  )}
                </Space>
              </Card>
            )}
          </Space>
        )}
      </Drawer>

      {/* ── Reason Modal ─────────────────────────────────────────────── */}
      <Modal
        open={reasonModal.open}
        title={reasonModal.action === 'approve' ? t('review.approveModalTitle') : t('review.rejectModalTitle')}
        onOk={handleReasonSubmit}
        onCancel={() => setReasonModal({ open: false, action: null, itemId: null, reason: '' })}
        okText={reasonModal.action === 'approve' ? t('review.approve') : t('review.reject')}
        okButtonProps={{ danger: reasonModal.action === 'reject' }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
          <Text>{reasonModal.action === 'approve' ? t('review.approveReasonHint') : t('review.rejectReasonHint')}</Text>
          <TextArea
            rows={3}
            value={reasonModal.reason}
            onChange={(e) => setReasonModal(prev => ({ ...prev, reason: e.target.value }))}
            placeholder={reasonModal.action === 'approve' ? t('review.approveReasonPlaceholder') : t('review.rejectReasonPlaceholder')}
          />
        </Space>
      </Modal>
    </Space>
  );
}
