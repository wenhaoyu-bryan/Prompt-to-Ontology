import { useEffect, useState, useCallback } from 'react';
import { Card, Space, Typography, Spin, Radio, Select, Button, Drawer, Tag, Checkbox, Row, Col, Statistic, Divider, Empty, Result } from 'antd';
import {
  ReloadOutlined,
  NodeIndexOutlined,
  ApartmentOutlined,
  CompressOutlined,
  ExpandOutlined,
  FilterOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../providers/dataProvider';
import D3GraphCanvas from '../legacy/D3GraphCanvas';
import EntityInspector from '../legacy/EntityInspector';

const { Title, Text } = Typography;

const LINK_TYPE_FILTERS = [
  { labelKey: 'graph.showBrands', value: 'MADE_BY' },
  { labelKey: 'graph.showIngredients', value: 'CONTAINS' },
  { labelKey: 'graph.showRisks', value: 'TRIGGERS_RISK' },
  { labelKey: 'graph.showSpecies', value: 'TARGETS_SPECIES' },
  { labelKey: 'graph.showLifeStage', value: 'SUITABLE_FOR' },
];

export default function GraphPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const highlightNodeId = searchParams.get('node');

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewMode, setViewMode] = useState('global');
  const [depth, setDepth] = useState(1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enabledLinkTypes, setEnabledLinkTypes] = useState(
    new Set(LINK_TYPE_FILTERS.map(f => f.value))
  );

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

  // Auto-select highlighted node from URL
  useEffect(() => {
    if (highlightNodeId && graphData.nodes.length > 0) {
      const node = graphData.nodes.find(n => n.id === highlightNodeId);
      if (node) {
        setSelectedNode(node);
        setViewMode('local');
        handleNodeClick(node);
      }
    }
  }, [highlightNodeId, graphData.nodes]);

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node);
    setViewMode('local');
    setDrawerOpen(true);
    try {
      const { data } = await api.get(`/node/${node.id}`);
      setNodeDetail(data);
    } catch {
      setNodeDetail(null);
    }
  }, []);

  // Compute local graph subset
  const getLocalGraph = () => {
    if (!selectedNode) return { nodes: [], links: [] };
    const adj = new Map();
    const filteredLinks = graphData.links.filter(l => enabledLinkTypes.has(l.linkType));
    filteredLinks.forEach(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (!adj.has(sid)) adj.set(sid, []);
      if (!adj.has(tid)) adj.set(tid, []);
      adj.get(sid).push(tid);
      adj.get(tid).push(sid);
    });

    const visited = new Set();
    const queue = [{ id: selectedNode.id, d: 0 }];
    visited.add(selectedNode.id);

    while (queue.length > 0) {
      const { id, d } = queue.shift();
      if (d >= depth) continue;
      const neighbors = adj.get(id) || [];
      for (const nid of neighbors) {
        if (!visited.has(nid)) {
          visited.add(nid);
          queue.push({ id: nid, d: d + 1 });
        }
      }
    }

    const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));
    const nodes = [...visited].map(id => nodeMap.get(id)).filter(Boolean);
    const nodeIds = new Set(visited);
    const links = filteredLinks.filter(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeIds.has(sid) && nodeIds.has(tid);
    });

    return { nodes, links };
  };

  const displayData = viewMode === 'local' ? getLocalGraph() : {
    nodes: graphData.nodes,
    links: graphData.links.filter(l => enabledLinkTypes.has(l.linkType)),
  };

  const handleNavigateToNode = useCallback((nodeId) => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) handleNodeClick(node);
  }, [graphData.nodes, handleNodeClick]);

  const resetFilters = () => {
    setEnabledLinkTypes(new Set(LINK_TYPE_FILTERS.map(f => f.value)));
    setViewMode('global');
    setDepth(1);
    setSelectedNode(null);
    setDrawerOpen(false);
    setNodeDetail(null);
  };

  // Graph stats
  const filteredLinkCount = graphData.links.filter(l => enabledLinkTypes.has(l.linkType)).length;
  const nodeTypeCounts = {};
  displayData.nodes.forEach(n => {
    const type = n.type || n.objectType;
    nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1;
  });

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 128px)' }}>
      {/* Left filter panel */}
      <Card
        size="small"
        style={{ width: 220, flexShrink: 0, overflow: 'auto' }}
        styles={{ body: { padding: '12px' } }}
        title={<><FilterOutlined /> {t('graph.controls')}</>}
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {/* View Mode */}
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>{t('graph.viewMode')}</Text>
            <Radio.Group value={viewMode} onChange={e => setViewMode(e.target.value)} size="small" style={{ width: '100%' }}>
              <Radio.Button value="local" style={{ width: '50%', textAlign: 'center' }}>
                <CompressOutlined /> {t('graph.localView')}
              </Radio.Button>
              <Radio.Button value="global" style={{ width: '50%', textAlign: 'center' }}>
                <ExpandOutlined /> {t('graph.globalView')}
              </Radio.Button>
            </Radio.Group>
          </div>

          {/* Depth selector (local mode only) */}
          {viewMode === 'local' && (
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>{t('graph.depth')}</Text>
              <Select
                value={depth}
                onChange={setDepth}
                size="small"
                style={{ width: '100%' }}
                options={[
                  { label: t('graph.oneHop'), value: 1 },
                  { label: t('graph.twoHop'), value: 2 },
                ]}
              />
            </div>
          )}

          <Divider style={{ margin: '4px 0' }} />

          {/* Link Type Filters */}
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>{t('graph.relationshipTypes')}</Text>
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
              {LINK_TYPE_FILTERS.map(f => (
                <Checkbox
                  key={f.value}
                  checked={enabledLinkTypes.has(f.value)}
                  onChange={e => {
                    const next = new Set(enabledLinkTypes);
                    if (e.target.checked) next.add(f.value);
                    else next.delete(f.value);
                    setEnabledLinkTypes(next);
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{t(f.labelKey)}</Text>
                </Checkbox>
              ))}
            </Space>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* Stats */}
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>{t('graph.graphStats')}</Text>
            <Space orientation="vertical" size={2} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12 }}>{t('graph.visibleNodes')}</Text>
                <Tag style={{ fontSize: 11 }}>{displayData.nodes.length}</Tag>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12 }}>{t('graph.visibleEdges')}</Text>
                <Tag style={{ fontSize: 11 }}>{displayData.links.length}</Tag>
              </div>
            </Space>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          {/* Actions */}
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <Button icon={<ReloadOutlined />} size="small" block onClick={loadGraph}>{t('common.refresh')}</Button>
            <Button size="small" block onClick={resetFilters}>{t('graph.resetFilters')}</Button>
          </Space>
        </Space>
      </Card>

      {/* Main graph area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Title & Status bar */}
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('graph.subtitle')}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11, opacity: 0.65 }}>{t('graph.evidenceExplanation')}</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {viewMode === 'local' && selectedNode && (
            <Tag color="blue" icon={<NodeIndexOutlined />}>
              {selectedNode.label || selectedNode.id} — {t('graph.nodeCount', { count: displayData.nodes.length })}
            </Tag>
          )}
          {viewMode === 'global' && (
            <Tag color="cyan" icon={<ApartmentOutlined />}>
              {t('graph.globalView')} — {displayData.nodes.length} {t('common.nodes')}
            </Tag>
          )}
        </div>

        {/* Graph canvas */}
        <div style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Spin size="large" />
            </div>
          ) : error ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Result
                status="warning"
                title={t('common.loadFailed')}
                extra={<Button type="primary" icon={<ReloadOutlined />} onClick={loadGraph}>{t('common.retry')}</Button>}
              />
            </div>
          ) : displayData.nodes.length === 0 && viewMode === 'local' ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Empty description={t('graph.selectNode')}>
                <Button icon={<ExpandOutlined />} onClick={() => setViewMode('global')}>
                  {t('graph.globalView')}
                </Button>
              </Empty>
            </div>
          ) : (
            <D3GraphCanvas
              graphData={displayData}
              selectedNode={selectedNode}
              onNodeClick={handleNodeClick}
              queriedNodeIds={[]}
              highlightedNodeIds={[]}
              navigateToNode={handleNavigateToNode}
              onRunAgent={() => {}}
              dataset="pet_food"
              embedded
            />
          )}
        </div>
      </div>

      {/* Entity Inspector drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedNode(null); setNodeDetail(null); }}
        size={520}
        styles={{ body: { padding: 0 } }}
        closable={false}
      >
        <EntityInspector
          selectedNode={selectedNode}
          nodeDetail={nodeDetail}
          onNavigateToNode={handleNavigateToNode}
          onRunAgent={() => {}}
        />
      </Drawer>
    </div>
  );
}
