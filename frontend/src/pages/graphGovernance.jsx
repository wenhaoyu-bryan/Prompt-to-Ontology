import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Space,
  Tag,
  Spin,
  Button,
  Table,
  Modal,
  Select,
  Alert,
  Collapse,
  message,
} from 'antd';
import {
  ReloadOutlined,
  CameraOutlined,
  SwapOutlined,
  EyeOutlined,
  UndoOutlined,
  HistoryOutlined,
  DiffOutlined,
  NodeIndexOutlined,
  AppstoreOutlined,
  PlusOutlined,
  MinusOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../providers/dataProvider';

const { Title, Text } = Typography;

export default function GraphGovernancePage() {
  const { t } = useTranslation();

  /* ── Section A state ── */
  const [demoState, setDemoState] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  /* ── Section B state ── */
  const [detailSnapshot, setDetailSnapshot] = useState(null);

  /* ── Section C state ── */
  const [beforeId, setBeforeId] = useState(null);
  const [afterId, setAfterId] = useState(null);
  const [diffResult, setDiffResult] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  /* ── Section D state ── */
  const [diffs, setDiffs] = useState([]);

  /* ── Refs ── */
  const diffSectionRef = useRef(null);

  /* ── Page-level loading ── */
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(false);

  /* ───────────────────── Data Loading ───────────────────── */

  const loadAll = async () => {
    setPageLoading(true);
    setPageError(false);
    try {
      const [demoRes, snapRes, diffRes] = await Promise.all([
        api.get('/demo/state').catch(() => null),
        api.get('/graph/snapshots').catch(() => null),
        api.get('/graph/diffs').catch(() => null),
      ]);
      if (!demoRes && !snapRes) {
        setPageError(true);
        return;
      }
      if (demoRes?.data) setDemoState(demoRes.data);
      if (snapRes?.data) {
        const list = Array.isArray(snapRes.data) ? snapRes.data : snapRes.data.snapshots || [];
        setSnapshots(list);
      }
      if (diffRes?.data) {
        const list = Array.isArray(diffRes.data) ? diffRes.data : diffRes.data.diffs || [];
        setDiffs(list);
      }
    } catch {
      setPageError(true);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  /* ───────────────────── Section A Actions ───────────────────── */

  const handleCreateSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      await api.post('/graph/snapshots', { reason: 'manual' });
      message.success(t('graphGovernance.snapshotCreated'));
      await loadAll();
    } catch {
      message.error(t('graphGovernance.snapshotCreateFailed'));
    } finally {
      setSnapshotLoading(false);
    }
  };

  /* ───────────────────── Section B Actions ───────────────────── */

  const handleRestore = (record) => {
    Modal.confirm({
      title: t('graphGovernance.restoreConfirmTitle'),
      content: t('graphGovernance.restoreConfirmDesc'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okType: 'danger',
      onOk: async () => {
        try {
          await api.post(`/graph/snapshots/${record.id}/restore`, { confirm: true });
          message.success(t('graphGovernance.restoreSuccess'));
          await loadAll();
        } catch {
          message.error(t('graphGovernance.restoreFailed'));
        }
      },
    });
  };

  /* ───────────────────── Section C Actions ───────────────────── */

  const handleCompare = async () => {
    if (!beforeId || !afterId) {
      message.warning(t('graphGovernance.selectBothSnapshots'));
      return;
    }
    setDiffLoading(true);
    setDiffResult(null);
    try {
      const res = await api.post('/graph/snapshots/compare', {
        before_snapshot_id: beforeId,
        after_snapshot_id: afterId,
      });
      if (res?.data) {
        setDiffResult(res.data);
      }
    } catch {
      message.error(t('graphGovernance.compareFailed'));
    } finally {
      setDiffLoading(false);
    }
  };

  const scrollToDiffSection = () => {
    diffSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleViewDiff = (record) => {
    setBeforeId(record.before_snapshot_id || record.before_id);
    setAfterId(record.after_snapshot_id || record.after_id);
    scrollToDiffSection();
  };

  /* ───────────────────── Derived Data ───────────────────── */

  const lastSnapshot = snapshots.length > 0 ? snapshots[0] : null;
  const nodeCount = demoState?.graph?.node_count ?? 0;
  const relCount = demoState?.graph?.relationship_count ?? 0;
  const demoMode = demoState?.mode || 'unknown';

  /* ───────────────────── Render Guards ───────────────────── */

  if (pageLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (pageError) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('common.loadFailed')}
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={loadAll}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  /* ───────────────────── Snapshot Table Columns ───────────────────── */

  const snapshotColumns = [
    {
      title: t('graphGovernance.snapshotId'),
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: t('graphGovernance.reason'),
      dataIndex: 'reason',
      key: 'reason',
      width: 120,
      render: (v) => {
        const colorMap = { manual: 'blue', auto: 'green', pipeline: 'orange', restore: 'red' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: t('graphGovernance.title'),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: t('graphGovernance.nodes'),
      dataIndex: 'node_count',
      key: 'node_count',
      width: 80,
      render: (v) => v ?? '-',
    },
    {
      title: t('graphGovernance.relationships'),
      dataIndex: 'relationship_count',
      key: 'relationship_count',
      width: 100,
      render: (v) => v ?? '-',
    },
    {
      title: t('graphGovernance.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: t('graphGovernance.actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailSnapshot(record)}
          >
            {t('graphGovernance.view')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SwapOutlined />}
            onClick={() => {
              setBeforeId(record.id);
              scrollToDiffSection();
            }}
          >
            {t('graphGovernance.compare')}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<UndoOutlined />}
            onClick={() => handleRestore(record)}
          >
            {t('graphGovernance.restore')}
          </Button>
        </Space>
      ),
    },
  ];

  /* ───────────────────── Diff Detail Columns ───────────────────── */

  const nodeDiffColumns = [
    { title: t('graphGovernance.nodeId'), dataIndex: 'id', key: 'id', width: 160, render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: t('graphGovernance.name'), dataIndex: 'name', key: 'name', ellipsis: true },
    { title: t('graphGovernance.type'), dataIndex: 'type', key: 'type', width: 120, render: (v) => v ? <Tag>{v}</Tag> : '-' },
    { title: t('graphGovernance.detail'), dataIndex: 'detail', key: 'detail', ellipsis: true },
  ];

  const relDiffColumns = [
    { title: t('graphGovernance.relId'), dataIndex: 'id', key: 'id', width: 120, render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: t('graphGovernance.linkType'), dataIndex: 'linkType', key: 'linkType', width: 120, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: t('graphGovernance.source'), dataIndex: 'source', key: 'source', ellipsis: true },
    { title: t('graphGovernance.target'), dataIndex: 'target', key: 'target', ellipsis: true },
    { title: t('graphGovernance.detail'), dataIndex: 'detail', key: 'detail', ellipsis: true },
  ];

  /* ───────────────────── Recent Diffs Columns ───────────────────── */

  const diffHistoryColumns = [
    {
      title: t('graphGovernance.diffId'),
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: t('graphGovernance.before'),
      dataIndex: 'before_snapshot_id',
      key: 'before_snapshot_id',
      width: 120,
      render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: t('graphGovernance.after'),
      dataIndex: 'after_snapshot_id',
      key: 'after_snapshot_id',
      width: 120,
      render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: t('graphGovernance.nodesDelta'),
      key: 'nodes_delta',
      width: 100,
      render: (_, record) => {
        const added = record.nodes_added || 0;
        const removed = record.nodes_removed || 0;
        return (
          <Space size={4}>
            {added > 0 && <Text style={{ color: '#52c41a', fontSize: 12 }}>+{added}</Text>}
            {removed > 0 && <Text style={{ color: '#ff4d4f', fontSize: 12 }}>-{removed}</Text>}
            {added === 0 && removed === 0 && <Text type="secondary" style={{ fontSize: 12 }}>0</Text>}
          </Space>
        );
      },
    },
    {
      title: t('graphGovernance.relsDelta'),
      key: 'rels_delta',
      width: 100,
      render: (_, record) => {
        const added = record.rels_added || 0;
        const removed = record.rels_removed || 0;
        return (
          <Space size={4}>
            {added > 0 && <Text style={{ color: '#52c41a', fontSize: 12 }}>+{added}</Text>}
            {removed > 0 && <Text style={{ color: '#ff4d4f', fontSize: 12 }}>-{removed}</Text>}
            {added === 0 && removed === 0 && <Text type="secondary" style={{ fontSize: 12 }}>0</Text>}
          </Space>
        );
      },
    },
    {
      title: t('graphGovernance.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: t('graphGovernance.action'),
      key: 'action',
      width: 110,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<DiffOutlined />}
          onClick={() => handleViewDiff(record)}
        >
          {t('graphGovernance.viewDiff')}
        </Button>
      ),
    },
  ];

  /* ───────────────────── Render ───────────────────── */

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      {/* Page Title */}
      <Card size="small" style={{ background: 'linear-gradient(135deg, rgba(22,119,255,0.06) 0%, rgba(114,46,209,0.06) 100%)' }}>
        <Title level={3} style={{ margin: 0 }}>{t('graphGovernance.title')}</Title>
        <Text type="secondary" style={{ fontSize: 14 }}>{t('graphGovernance.subtitle')}</Text>
      </Card>

      {/* ───── Section A: Current Graph State ───── */}
      <Card
        title={<><AppstoreOutlined /> {t('graphGovernance.currentGraphState')}</>}
        size="small"
        extra={
          <Button
            type="primary"
            icon={<CameraOutlined />}
            loading={snapshotLoading}
            onClick={handleCreateSnapshot}
          >
            {t('graphGovernance.createSnapshot')}
          </Button>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Statistic
              title={t('dashboard.totalNodes')}
              value={nodeCount}
              prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title={t('dashboard.graphEdges')}
              value={relCount}
              prefix={<NodeIndexOutlined style={{ color: '#52c41a' }} />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('graphGovernance.demoMode')}</Text>
            </div>
            <Tag
              color={
                demoMode === 'seeded' ? 'green' :
                demoMode === 'clean' ? 'blue' :
                demoMode === 'custom_build' ? 'orange' : 'default'
              }
              style={{ fontSize: 13, padding: '2px 12px' }}
            >
              {demoMode}
            </Tag>
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title={t('graphGovernance.lastSnapshot')}
              value={lastSnapshot ? new Date(lastSnapshot.created_at).toLocaleDateString() : '-'}
              prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
            />
          </Col>
        </Row>
      </Card>

      {/* ───── Section B: Snapshot History ───── */}
      <Card
        title={<><HistoryOutlined /> {t('graphGovernance.snapshotHistory')}</>}
        size="small"
      >
        <Table
          dataSource={snapshots}
          columns={snapshotColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: t('graphGovernance.noSnapshots') }}
        />
      </Card>

      {/* Snapshot Detail Modal */}
      <Modal
        title={t('graphGovernance.snapshotDetail')}
        open={!!detailSnapshot}
        onCancel={() => setDetailSnapshot(null)}
        footer={null}
        width={600}
      >
        {detailSnapshot && (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Row gutter={[16, 8]}>
              <Col span={12}>
                <Text type="secondary">{t('graphGovernance.snapshotId')}</Text>
                <div><Text code>{detailSnapshot.id}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">{t('graphGovernance.reason')}</Text>
                <div><Tag>{detailSnapshot.reason}</Tag></div>
              </Col>
            </Row>
            {detailSnapshot.title && (
              <div>
                <Text type="secondary">{t('graphGovernance.title')}</Text>
                <div><Text>{detailSnapshot.title}</Text></div>
              </div>
            )}
            <Row gutter={[16, 8]}>
              <Col span={8}>
                <Statistic title={t('graphGovernance.nodes')} value={detailSnapshot.node_count ?? '-'} valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title={t('graphGovernance.relationships')} value={detailSnapshot.relationship_count ?? '-'} valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title={t('graphGovernance.createdAt')} value={detailSnapshot.created_at ? new Date(detailSnapshot.created_at).toLocaleString() : '-'} valueStyle={{ fontSize: 14 }} />
              </Col>
            </Row>
          </Space>
        )}
      </Modal>

      {/* ───── Section C: Diff Viewer ───── */}
      <div ref={diffSectionRef}>
        <Card
          title={<><DiffOutlined /> {t('graphGovernance.diffViewer')}</>}
          size="small"
        >
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={16} align="bottom">
              <Col xs={24} sm={8}>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('graphGovernance.beforeSnapshot')}</Text>
                </div>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('graphGovernance.selectSnapshot')}
                  value={beforeId}
                  onChange={setBeforeId}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={snapshots.map((s) => ({
                    value: s.id,
                    label: `${s.id} - ${s.reason || ''} ${s.title ? `(${s.title})` : ''}`,
                  }))}
                />
              </Col>
              <Col xs={24} sm={8}>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('graphGovernance.afterSnapshot')}</Text>
                </div>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('graphGovernance.selectSnapshot')}
                  value={afterId}
                  onChange={setAfterId}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={snapshots.map((s) => ({
                    value: s.id,
                    label: `${s.id} - ${s.reason || ''} ${s.title ? `(${s.title})` : ''}`,
                  }))}
                />
              </Col>
              <Col xs={24} sm={8}>
                <Button
                  type="primary"
                  icon={<SwapOutlined />}
                  loading={diffLoading}
                  onClick={handleCompare}
                  block
                  style={{ marginTop: 22 }}
                >
                  {t('graphGovernance.compareSnapshots')}
                </Button>
              </Col>
            </Row>

            {/* Summary Statistic Cards */}
            {diffResult && (
              <>
                <Row gutter={[16, 16]}>
                  <Col xs={8} sm={4}>
                    <Card size="small">
                      <Statistic
                        title={t('graphGovernance.nodesAdded')}
                        value={diffResult.summary?.nodes_added ?? 0}
                        valueStyle={{ color: '#52c41a', fontSize: 18 }}
                        prefix={<PlusOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col xs={8} sm={4}>
                    <Card size="small">
                      <Statistic
                        title={t('graphGovernance.nodesRemoved')}
                        value={diffResult.summary?.nodes_removed ?? 0}
                        valueStyle={{ color: '#ff4d4f', fontSize: 18 }}
                        prefix={<MinusOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col xs={8} sm={4}>
                    <Card size="small">
                      <Statistic
                        title={t('graphGovernance.nodesChanged')}
                        value={diffResult.summary?.nodes_changed ?? 0}
                        valueStyle={{ color: '#fa8c16', fontSize: 18 }}
                        prefix={<EditOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col xs={8} sm={4}>
                    <Card size="small">
                      <Statistic
                        title={t('graphGovernance.relsAdded')}
                        value={diffResult.summary?.rels_added ?? 0}
                        valueStyle={{ color: '#52c41a', fontSize: 18 }}
                        prefix={<PlusOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col xs={8} sm={4}>
                    <Card size="small">
                      <Statistic
                        title={t('graphGovernance.relsRemoved')}
                        value={diffResult.summary?.rels_removed ?? 0}
                        valueStyle={{ color: '#ff4d4f', fontSize: 18 }}
                        prefix={<MinusOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col xs={8} sm={4}>
                    <Card size="small">
                      <Statistic
                        title={t('graphGovernance.relsChanged')}
                        value={diffResult.summary?.rels_changed ?? 0}
                        valueStyle={{ color: '#fa8c16', fontSize: 18 }}
                        prefix={<EditOutlined />}
                      />
                    </Card>
                  </Col>
                </Row>

                {/* Collapsible Detail Tables */}
                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'nodesAdded',
                      label: `${t('graphGovernance.nodesAdded')} (${(diffResult.nodes_added || []).length})`,
                      children: (
                        <Table
                          dataSource={diffResult.nodes_added || []}
                          columns={nodeDiffColumns}
                          rowKey={(r, i) => r.id || i}
                          size="small"
                          pagination={false}
                          locale={{ emptyText: '-' }}
                        />
                      ),
                    },
                    {
                      key: 'nodesRemoved',
                      label: `${t('graphGovernance.nodesRemoved')} (${(diffResult.nodes_removed || []).length})`,
                      children: (
                        <Table
                          dataSource={diffResult.nodes_removed || []}
                          columns={nodeDiffColumns}
                          rowKey={(r, i) => r.id || i}
                          size="small"
                          pagination={false}
                          locale={{ emptyText: '-' }}
                        />
                      ),
                    },
                    {
                      key: 'nodesChanged',
                      label: `${t('graphGovernance.nodesChanged')} (${(diffResult.nodes_changed || []).length})`,
                      children: (
                        <Table
                          dataSource={diffResult.nodes_changed || []}
                          columns={nodeDiffColumns}
                          rowKey={(r, i) => r.id || i}
                          size="small"
                          pagination={false}
                          locale={{ emptyText: '-' }}
                        />
                      ),
                    },
                    {
                      key: 'relsAdded',
                      label: `${t('graphGovernance.relsAdded')} (${(diffResult.rels_added || []).length})`,
                      children: (
                        <Table
                          dataSource={diffResult.rels_added || []}
                          columns={relDiffColumns}
                          rowKey={(r, i) => r.id || i}
                          size="small"
                          pagination={false}
                          locale={{ emptyText: '-' }}
                        />
                      ),
                    },
                    {
                      key: 'relsRemoved',
                      label: `${t('graphGovernance.relsRemoved')} (${(diffResult.rels_removed || []).length})`,
                      children: (
                        <Table
                          dataSource={diffResult.rels_removed || []}
                          columns={relDiffColumns}
                          rowKey={(r, i) => r.id || i}
                          size="small"
                          pagination={false}
                          locale={{ emptyText: '-' }}
                        />
                      ),
                    },
                    {
                      key: 'relsChanged',
                      label: `${t('graphGovernance.relsChanged')} (${(diffResult.rels_changed || []).length})`,
                      children: (
                        <Table
                          dataSource={diffResult.rels_changed || []}
                          columns={relDiffColumns}
                          rowKey={(r, i) => r.id || i}
                          size="small"
                          pagination={false}
                          locale={{ emptyText: '-' }}
                        />
                      ),
                    },
                  ]}
                />
              </>
            )}
          </Space>
        </Card>
      </div>

      {/* ───── Section D: Recent Graph Diffs ───── */}
      <Card
        title={<><SwapOutlined /> {t('graphGovernance.recentDiffs')}</>}
        size="small"
      >
        <Table
          dataSource={diffs}
          columns={diffHistoryColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: t('graphGovernance.noDiffs') }}
        />
      </Card>
    </Space>
  );
}
