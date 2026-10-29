import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Descriptions, Drawer, Empty, Select, Space, Spin, Tag, Typography, theme } from 'antd';
import { ApartmentOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../providers/dataProvider';
import SigmaGraph, { typeColor } from '../components/graph/SigmaGraph';
import './graphExplorer.css';

const { Text, Title } = Typography;

function edgeMatches(step, edge) {
  return step.kind === 'instance_relation' && edge.source === step.source_id &&
    edge.target === step.target_id && edge.linkType === step.relation;
}

export default function GraphPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const { token } = theme.useToken();
  const [params] = useSearchParams();
  const questionId = params.get('question');
  const initialNode = params.get('node');
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState(null);
  const [answerError, setAnswerError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [mode, setMode] = useState('global');
  const [depth, setDepth] = useState(1);
  const [enabledTypes, setEnabledTypes] = useState(null);
  const [drawer, setDrawer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/graph');
      setGraph({ nodes: data.nodes || [], links: data.links || [] });
    } catch { setError(zh ? '图谱加载失败，请检查服务后重试。' : 'Could not load the graph. Check the service and retry.'); }
    finally { setLoading(false); }
  }, [zh]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    setAnswer(null); setAnswerError('');
    if (!questionId) return () => { active = false; };
    api.post('/verified-qa/answer', { question_id: questionId })
      .then(({ data }) => { if (active) setAnswer(data); })
      .catch(() => { if (active) setAnswerError(zh ? '无法加载此问题的证据。' : 'Could not load evidence for this question.'); });
    return () => { active = false; };
  }, [questionId, zh]);

  useEffect(() => {
    const id = answer?.path?.find(step => step.kind === 'instance_relation')?.source_id || initialNode;
    if (id && graph.nodes.some(node => node.id === id)) { setSelectedId(id); setMode('local'); }
  }, [answer, graph.nodes, initialNode]);

  const relationTypes = useMemo(() => [...new Set(graph.links.map(edge => edge.linkType).filter(Boolean))].sort(), [graph.links]);
  const types = useMemo(() => [...new Set(graph.nodes.map(node => node.objectType || node.type).filter(Boolean))].sort(), [graph.nodes]);
  const match = useMemo(() => {
    const steps = (answer?.path || []).filter(step => step.kind === 'instance_relation');
    const edges = steps.flatMap(step => graph.links.filter(edge => edgeMatches(step, edge)));
    return { steps, edges, missing: steps.filter(step => !graph.links.some(edge => edgeMatches(step, edge))) };
  }, [answer, graph.links]);
  const highlighted = useMemo(() => match.edges.map(edge => edge.id), [match.edges]);
  const filteredLinks = useMemo(() => graph.links.filter(edge => !enabledTypes || enabledTypes.includes(edge.linkType)), [graph.links, enabledTypes]);
  const displayed = useMemo(() => {
    if (mode === 'global' || !selectedId) return { nodes: graph.nodes, links: filteredLinks };
    const ids = new Set([selectedId]); let frontier = new Set([selectedId]);
    for (let i = 0; i < depth; i += 1) {
      const next = new Set();
      filteredLinks.forEach(edge => {
        if (frontier.has(edge.source) && !ids.has(edge.target)) next.add(edge.target);
        if (frontier.has(edge.target) && !ids.has(edge.source)) next.add(edge.source);
      });
      next.forEach(id => ids.add(id)); frontier = next;
    }
    return { nodes: graph.nodes.filter(node => ids.has(node.id)), links: filteredLinks.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  }, [mode, selectedId, depth, graph.nodes, filteredLinks]);
  const selectedNode = graph.nodes.find(node => node.id === selectedId);
  const selectedEdge = graph.links.find(edge => edge.id === selectedEdgeId);
  const visibleMatches = match.edges.filter(edge => displayed.links.some(item => item.id === edge.id));
  const selectNode = useCallback(id => { setSelectedId(id); setSelectedEdgeId(null); setMode('local'); setDrawer({ kind: 'node', id }); }, []);
  const selectEdge = useCallback(id => { setSelectedEdgeId(id); setDrawer({ kind: 'edge', id }); }, []);
  const drawerNode = drawer?.kind === 'node' ? graph.nodes.find(node => node.id === drawer.id) : null;
  const drawerEdge = drawer?.kind === 'edge' ? graph.links.find(edge => edge.id === drawer.id) : null;
  const drawerEvidence = drawer?.kind === 'evidence' ? drawer.evidence : null;

  return <div className="graph-workspace" style={{ '--graph-surface': token.colorBgContainer, '--graph-bg': token.colorBgLayout, '--graph-border': token.colorBorderSecondary, '--graph-muted': token.colorTextSecondary }}>
    <header className="graph-heading">
      <div><Title level={3} style={{ margin: 0 }}><ApartmentOutlined /> {zh ? '图谱探索' : 'Graph Explorer'}</Title>
        <Text type="secondary">{zh ? '从对象出发，探索关系与证据。' : 'Explore objects, relationships, and their evidence.'}</Text></div>
      <Button icon={<ReloadOutlined />} onClick={load}>{zh ? '刷新' : 'Refresh'}</Button>
    </header>
    <div className="graph-content">
      <aside className="graph-controls graph-panel">
        <Text strong>{zh ? '探索图谱' : 'Explore graph'}</Text>
        <label className="graph-field"><span>{zh ? '查找对象' : 'Find an object'}</span>
          <Select showSearch allowClear suffixIcon={<SearchOutlined />} placeholder={zh ? '搜索名称或 ID' : 'Search by name or ID'} value={selectedId || undefined}
            optionFilterProp="label" onChange={value => value ? selectNode(value) : (setSelectedId(null), setMode('global'))}
            options={graph.nodes.map(node => ({ value: node.id, label: `${node.label || node.id} · ${node.id}` }))} />
        </label>
        <div className="graph-field"><span>{zh ? '视图' : 'View'}</span>
          <Space.Compact block><Button type={mode === 'global' ? 'primary' : 'default'} onClick={() => setMode('global')} style={{ width: '50%' }}>{zh ? '全图' : 'Overview'}</Button>
            <Button type={mode === 'local' ? 'primary' : 'default'} disabled={!selectedId} onClick={() => setMode('local')} style={{ width: '50%' }}>{zh ? '局部' : 'Focus'}</Button></Space.Compact>
        </div>
        {mode === 'local' && <label className="graph-field"><span>{zh ? '邻域范围' : 'Neighborhood'}</span><Select value={depth} onChange={setDepth} options={[{ value: 1, label: zh ? '一跳' : '1 hop' }, { value: 2, label: zh ? '两跳' : '2 hops' }]} /></label>}
        <div className="graph-field"><span>{zh ? '关系类型' : 'Relationships'}</span>
          <Checkbox.Group value={enabledTypes || relationTypes} onChange={setEnabledTypes} className="graph-checkboxes" options={relationTypes.map(value => ({ value, label: value }))} />
        </div>
        <div className="graph-field"><span>{zh ? '对象类型' : 'Object types'}</span>
          {types.map(type => <div className="graph-legend" key={type}><i style={{ background: typeColor(type) }} />{type}</div>)}
        </div>
      </aside>
      <section className="graph-main graph-panel">
        <div className="graph-canvas-heading"><div><Text strong>{mode === 'local' && selectedNode ? (selectedNode.label || selectedNode.id) : (zh ? '实例图谱' : 'Instance graph')}</Text>
          <div><Text type="secondary">{displayed.nodes.length} {zh ? '个对象' : 'objects'} · {displayed.links.length} {zh ? '条关系' : 'relationships'}</Text></div></div>
          <Tag>{zh ? '运行时图谱' : 'Runtime graph'}</Tag></div>
        <div className="graph-canvas" style={{ background: token.colorBgLayout }}>
          {loading ? <div className="graph-centered"><Spin /></div> : error ? <div className="graph-centered"><Alert type="error" showIcon title={error} action={<Button onClick={load}>{zh ? '重试' : 'Retry'}</Button>} /></div> : !displayed.nodes.length ? <div className="graph-centered"><Empty description={zh ? '暂无图谱数据' : 'No graph data'} /></div> :
            <SigmaGraph data={displayed} selectedId={selectedId} highlightedEdges={highlighted} onNodeSelect={selectNode} onEdgeSelect={selectEdge} zh={zh} />}
        </div>
        <div className="graph-canvas-footer">{zh ? '点击对象查看详情 · 选择关系类型过滤画布' : 'Select an object for details · Filter relationships to focus the canvas'}</div>
      </section>
      <aside className="graph-evidence graph-panel" data-testid="graph-evidence-panel">
        <Text strong>{questionId ? (zh ? '问题证据' : 'Question evidence') : (zh ? '探索提示' : 'Explore with context')}</Text>
        {!questionId && <p className="graph-copy">{zh ? '搜索对象或点击节点，查看它的属性和相邻关系。也可以从可核对问答打开证据路径。' : 'Search for or select an object to inspect its properties and neighbors. Open a verified question to trace its evidence.'}</p>}
        {answerError && <Alert type="warning" showIcon title={answerError} />}
        {questionId && !answer && !answerError && <Spin size="small" />}
        {answer && <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap><Tag color="blue">{answer.question_id}</Tag><Tag color={answer.status === 'unknown' ? 'orange' : 'green'}>{answer.status}</Tag></Space>
          <Text>{answer.conclusion}</Text>
          <Tag>{zh ? '答案来自样例文件' : 'Answer from sample files'}</Tag>
          {answer.unknown_reasons?.length > 0 && <Alert type="warning" showIcon title={zh ? '证据不足' : 'Insufficient evidence'} description={answer.unknown_reasons.join(', ')} />}
          {match.steps.length > 0 && (loading ? <Spin size="small" /> : !error && <Alert type={match.missing.length ? 'warning' : 'success'} showIcon title={match.missing.length ? (zh ? '运行时图中未找到完整路径' : 'The full path is not present in the runtime graph') : (zh ? '已在运行时图中找到关系' : 'Relationship found in runtime graph')} description={visibleMatches.length < match.edges.length ? (zh ? '部分匹配关系被当前筛选或局部视图隐藏。答案仍来自样例文件。' : 'Some matching relationships are hidden by the current filter or focus. The answer still comes from sample files.') : (zh ? '图中高亮仅表示关系匹配；样例答案仍来自文件。' : 'Highlighting shows a matching relationship; the answer still comes from the sample files.')} />)}
          {answer.path?.length > 0 && <div className="graph-evidence-list">{answer.path.map((step, index) => <div key={`${step.source_id}-${step.relation}-${step.target_id}-${index}`}><Text code>{step.source_id}</Text><span> → {step.relation} → </span><Text code>{step.target_id}</Text></div>)}</div>}
          {answer.evidence?.map(item => <Button key={item.evidence_id} block style={{ height: 'auto', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => setDrawer({ kind: 'evidence', evidence: item })}><span>{item.source_path.split('/').pop()} · {item.field}</span></Button>)}
        </Space>}
      </aside>
    </div>
    <Drawer title={drawerEvidence ? (zh ? '来源记录' : 'Source record') : drawerEdge ? (zh ? '关系详情' : 'Relationship details') : (zh ? '对象详情' : 'Object details')} open={!!drawer} onClose={() => setDrawer(null)} size={480}>
      {drawerNode && <><Title level={4}>{drawerNode.label || drawerNode.id}</Title><Space wrap><Tag color="blue">{drawerNode.objectType || drawerNode.type}</Tag><Text code>{drawerNode.id}</Text></Space>
        <Descriptions style={{ marginTop: 20 }} column={1} bordered size="small" items={Object.entries(drawerNode).filter(([key]) => !['id', 'label', 'type', 'objectType', 'color', 'size', 'alert'].includes(key)).map(([key, value]) => ({ key, label: key, children: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—') }))} /></>}
      {drawerEdge && <Descriptions column={1} bordered size="small" items={[
        { key: 'type', label: zh ? '关系' : 'Relationship', children: drawerEdge.linkType },
        { key: 'source', label: zh ? '起点' : 'Source', children: drawerEdge.source },
        { key: 'target', label: zh ? '终点' : 'Target', children: drawerEdge.target },
        { key: 'id', label: 'ID', children: <Text copyable>{drawerEdge.id}</Text> },
      ]} />}
      {drawerEvidence && <Descriptions column={1} bordered size="small" items={[
        { key: 'path', label: zh ? '来源文件' : 'Source file', children: drawerEvidence.source_path },
        { key: 'hash', label: 'SHA-256', children: <Text copyable style={{ wordBreak: 'break-all' }}>{drawerEvidence.source_sha256}</Text> },
        { key: 'record', label: zh ? '记录' : 'Record', children: drawerEvidence.record_id },
        { key: 'field', label: zh ? '字段' : 'Field', children: drawerEvidence.field },
        { key: 'value', label: zh ? '原始值' : 'Source value', children: String(drawerEvidence.value ?? '—') },
      ]} />}
      {selectedEdge && drawerEdge && <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>{zh ? '此 ID 用于图谱展示；同类型平行关系发生变化时可能重新生成。' : 'This is a display ID; it can change when parallel relationships of the same type change.'}</Text>}
    </Drawer>
  </div>;
}
