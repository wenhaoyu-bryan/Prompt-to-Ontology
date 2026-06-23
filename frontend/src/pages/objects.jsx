import { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Table, Tag, Space, Typography, Spin, Input, Button, Descriptions, Drawer, Badge, Divider, Empty, Tooltip, Progress, Result } from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  NodeIndexOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  BranchesOutlined,
  TagOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../providers/dataProvider';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const TYPE_COLORS = {
  PetFoodProduct: 'blue',
  Brand: 'purple',
  Ingredient: 'green',
  RiskRule: 'red',
  Species: 'cyan',
  LifeStage: 'orange',
};

const TYPE_ICONS = {
  PetFoodProduct: '📦',
  Brand: '🏷️',
  Ingredient: '🧪',
  RiskRule: '⚠️',
  Species: '🐾',
  LifeStage: '📅',
};

export default function ObjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedType, setSelectedType] = useState('PetFoodProduct');
  const [search, setSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get('/graph');
      setGraphData(data);
    } catch {
      setGraphData({ nodes: [], links: [] });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Compute per-node stats
  const nodeStats = {};
  graphData.nodes.forEach(n => {
    const outgoing = graphData.links.filter(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      return sid === n.id;
    });
    const riskEdges = outgoing.filter(l => l.linkType === 'TRIGGERS_RISK');
    nodeStats[n.id] = {
      outgoingCount: outgoing.length,
      riskCount: riskEdges.length,
      evidenceCount: outgoing.filter(l => l.linkType !== 'TRIGGERS_RISK').length,
    };
  });

  const typeCounts = {};
  graphData.nodes.forEach(n => {
    const type = n.type || n.objectType;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const filteredNodes = graphData.nodes.filter(n => {
    const type = n.type || n.objectType;
    if (type !== selectedType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (n.label || '').toLowerCase().includes(q) || (n.id || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleViewDetail = async (node) => {
    setSelectedNode(node);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const { data } = await api.get(`/node/${node.id}`);
      setNodeDetail(data);
    } catch {
      setNodeDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const riskEdges = selectedNode
    ? graphData.links.filter(l => (l.source === selectedNode.id || l.source?.id === selectedNode.id) && l.linkType === 'TRIGGERS_RISK')
    : [];

  const relatedEdges = selectedNode
    ? graphData.links.filter(l => {
        const sid = typeof l.source === 'object' ? l.source.id : l.source;
        const tid = typeof l.target === 'object' ? l.target.id : l.target;
        return sid === selectedNode.id || tid === selectedNode.id;
      })
    : [];

  const columns = [
    {
      title: t('common.name'),
      dataIndex: 'label',
      key: 'label',
      render: (text, record) => (
        <Space>
          <span>{TYPE_ICONS[record.type || record.objectType] || '📋'}</span>
          <Text strong>{text || record.id}</Text>
        </Space>
      ),
      sorter: (a, b) => (a.label || '').localeCompare(b.label || ''),
    },
    {
      title: t('common.id'),
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id) => <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</Text>,
    },
    {
      title: t('common.type'),
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type) => <Tag color={TYPE_COLORS[type]}>{type}</Tag>,
    },
    {
      title: t('objects.evidenceCount'),
      key: 'evidence',
      width: 100,
      render: (_, record) => {
        const stats = nodeStats[record.id] || {};
        return <Text type="secondary">{stats.evidenceCount || 0}</Text>;
      },
      sorter: (a, b) => (nodeStats[a.id]?.evidenceCount || 0) - (nodeStats[b.id]?.evidenceCount || 0),
    },
    {
      title: t('objects.riskLevel'),
      key: 'risk',
      width: 100,
      render: (_, record) => {
        const stats = nodeStats[record.id] || {};
        const count = stats.riskCount || 0;
        if (count === 0) return <Tag color="green">{t('objects.low')}</Tag>;
        if (count === 1) return <Tag color="orange">{t('objects.medium')}</Tag>;
        return <Tag color="red">{t('objects.high')}</Tag>;
      },
      sorter: (a, b) => (nodeStats[a.id]?.riskCount || 0) - (nodeStats[b.id]?.riskCount || 0),
    },
    {
      title: t('objects.connections'),
      key: 'connections',
      width: 100,
      render: (_, record) => {
        const stats = nodeStats[record.id] || {};
        return <Badge count={stats.outgoingCount || 0} showZero style={{ backgroundColor: '#1677ff' }} overflowCount={99} />;
      },
      sorter: (a, b) => (nodeStats[a.id]?.outgoingCount || 0) - (nodeStats[b.id]?.outgoingCount || 0),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={t('objects.viewDetail')}>
            <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          </Tooltip>
          <Tooltip title={t('objects.viewGraph')}>
            <Button size="small" type="text" icon={<BranchesOutlined />} onClick={() => navigate(`/graph?node=${record.id}`)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('objects.title')}</Title>
          <Text type="secondary">{t('objects.subtitle')}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{t('objects.objectsInGraph', { count: graphData.nodes.length })}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadGraph}>{t('common.refresh')}</Button>
      </div>

      {/* Type selector + Search in one row */}
      <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <FilterOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />
          {Object.keys(TYPE_COLORS).map(type => (
            <Tag
              key={type}
              color={selectedType === type ? TYPE_COLORS[type] : undefined}
              style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
              onClick={() => setSelectedType(type)}
            >
              {TYPE_ICONS[type] || '📋'} {type} ({typeCounts[type] || 0})
            </Tag>
          ))}
          <div style={{ flex: 1 }} />
          <Input
            placeholder={t('objects.searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 240 }}
            allowClear
            size="small"
          />
        </div>
      </Card>

      {/* Table */}
      <Card styles={{ body: { padding: 0 } }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : error ? (
          <Result
            status="warning"
            title={t('common.loadFailed')}
            extra={<Button type="primary" icon={<ReloadOutlined />} onClick={loadGraph}>{t('common.retry')}</Button>}
          />
        ) : (
          <Table
            dataSource={filteredNodes}
            rowKey="id"
            size="small"
            scroll={{ x: 800 }}
            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (total) => `${total} items` }}
            columns={columns}
            onRow={(record) => ({
              onClick: () => handleViewDetail(record),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={
          <Space>
            <span>{TYPE_ICONS[selectedNode?.type || selectedNode?.objectType] || '📋'}</span>
            <span>{selectedNode?.label || selectedNode?.id || t('common.detail')}</span>
            <Tag color={TYPE_COLORS[selectedNode?.type || selectedNode?.objectType]}>
              {selectedNode?.type || selectedNode?.objectType}
            </Tag>
          </Space>
        }
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedNode(null); setNodeDetail(null); }}
        size={520}
      >
        {drawerLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : nodeDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Identity */}
            <Card size="small" title={t('objects.objectInfo')} variant="inner">
              <Descriptions column={1} size="small">
                <Descriptions.Item label={t('common.id')}>
                  <Text code>{nodeDetail.id}</Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('common.type')}>
                  <Tag color={TYPE_COLORS[nodeDetail.type || nodeDetail.objectType]}>
                    {nodeDetail.type || nodeDetail.objectType}
                  </Tag>
                </Descriptions.Item>
                {nodeDetail.name && <Descriptions.Item label={t('common.name')}>{nodeDetail.name}</Descriptions.Item>}
                {nodeDetail.brand && <Descriptions.Item label={t('common.brand')}>{nodeDetail.brand}</Descriptions.Item>}
                {nodeDetail.species && <Descriptions.Item label={t('common.species')}>{nodeDetail.species}</Descriptions.Item>}
                {nodeDetail.life_stage && <Descriptions.Item label={t('common.lifeStage')}>{nodeDetail.life_stage}</Descriptions.Item>}
                {nodeDetail.category && <Descriptions.Item label={t('common.category')}>{nodeDetail.category}</Descriptions.Item>}
              </Descriptions>
            </Card>

            {/* Stats */}
            <Card size="small" variant="inner">
              <Row gutter={16}>
                <Col span={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#1677ff' }}>
                      {relatedEdges.length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{t('objects.connections')}</Text>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: riskEdges.length > 0 ? '#ff4d4f' : '#52c41a' }}>
                      {riskEdges.length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{t('common.risks')}</Text>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#722ed1' }}>
                      {nodeDetail.properties ? Object.keys(nodeDetail.properties).length : 0}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{t('common.properties')}</Text>
                  </div>
                </Col>
              </Row>
            </Card>

            {/* Risks */}
            {riskEdges.length > 0 && (
              <Card size="small" title={<><ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> {t('common.risks')} ({riskEdges.length})</>} variant="inner">
                {riskEdges.map((r, i) => (
                  <Tag key={i} color="red" style={{ margin: 2 }}>
                    {r.target?.label || r.target || t('common.risk')}
                  </Tag>
                ))}
              </Card>
            )}

            {/* Related Objects */}
            {relatedEdges.length > 0 && (
              <Card size="small" title={<><NodeIndexOutlined /> {t('objects.relatedObjects')} ({relatedEdges.length})</>} variant="inner">
                <Table
                  dataSource={relatedEdges.slice(0, 20)}
                  rowKey={(_, i) => i}
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: t('common.type'),
                      dataIndex: 'linkType',
                      key: 'linkType',
                      width: 130,
                      render: (lt) => <Tag>{lt}</Tag>,
                    },
                    {
                      title: t('common.target'),
                      key: 'target',
                      render: (_, record) => {
                        const tid = typeof record.target === 'object' ? record.target.id : record.target;
                        const tlabel = typeof record.target === 'object' ? record.target.label : record.target;
                        return (
                          <Button type="link" size="small" onClick={(e) => {
                            e.stopPropagation();
                            const node = graphData.nodes.find(n => n.id === tid);
                            if (node) handleViewDetail(node);
                          }}>
                            {tlabel || tid}
                          </Button>
                        );
                      },
                    },
                  ]}
                />
              </Card>
            )}

            {/* Properties */}
            {nodeDetail.properties && Object.keys(nodeDetail.properties).length > 0 && (
              <Card size="small" title={t('common.properties')} variant="inner">
                <Descriptions column={1} size="small">
                  {Object.entries(nodeDetail.properties).map(([k, v]) => (
                    <Descriptions.Item key={k} label={k}>{String(v)}</Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            )}
          </Space>
        ) : (
          <Empty description={t('common.noData')} />
        )}
      </Drawer>
    </Space>
  );
}
