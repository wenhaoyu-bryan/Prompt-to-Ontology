import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Descriptions, Drawer, Empty, Popover, Select, Space, Spin, Tag, Typography, theme } from 'antd';
import { ApartmentOutlined, ArrowLeftOutlined, FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const navigate = useNavigate();
  const questionId = params.get('question');
  const initialNode = params.get('node');
  const targetNode = params.get('target');
  const relation = params.get('relation');
  const conversationId = params.get('conversation');
  const turnId = params.get('turn');
  const evaluationId = params.get('evaluation');
  const evaluationCase = params.get('case');
  const replayContext = params.get('from') === 'evaluation' ? {from:'evaluation',case:evaluationCase||'',evaluation_run:params.get('evaluation_run')||''} : {};
  const runtimePath = useMemo(() => initialNode && targetNode && relation && (conversationId || evaluationId)
    ? [{ kind: 'instance_relation', source_id: initialNode, target_id: targetNode, relation }] : [],
  [initialNode, targetNode, relation, conversationId, evaluationId]);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState(null);
  const [answerError, setAnswerError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [mode, setMode] = useState('global');
  const [depth, setDepth] = useState(1);
  const [showAllRelations, setShowAllRelations] = useState(false);
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
    const steps = (answer?.path || runtimePath).filter(step => step.kind === 'instance_relation');
    const edges = steps.flatMap(step => graph.links.filter(edge => edgeMatches(step, edge)));
    return { steps, edges, missing: steps.filter(step => !graph.links.some(edge => edgeMatches(step, edge))) };
  }, [answer, runtimePath, graph.links]);
  const highlighted = useMemo(() => match.edges.map(edge => edge.id), [match.edges]);
  const filteredLinks = useMemo(() => graph.links.filter(edge => !enabledTypes || enabledTypes.includes(edge.linkType)), [graph.links, enabledTypes]);
  const overviewLinks = useMemo(() => {
    const seen = new Set();
    return [...filteredLinks].sort((a, b) => `${a.source}:${a.linkType}:${a.target}:${a.id}`.localeCompare(`${b.source}:${b.linkType}:${b.target}:${b.id}`)).filter(edge => {
      const key = JSON.stringify([edge.source, edge.linkType]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [filteredLinks]);
  const displayed = useMemo(() => {
    if (mode === 'global' || !selectedId) return { nodes: graph.nodes, links: showAllRelations ? filteredLinks : overviewLinks };
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
  }, [mode, selectedId, depth, graph.nodes, filteredLinks, overviewLinks, showAllRelations]);
  const selectedNode = graph.nodes.find(node => node.id === selectedId);
  const selectedEdge = graph.links.find(edge => edge.id === selectedEdgeId);
  const visibleMatches = match.edges.filter(edge => displayed.links.some(item => item.id === edge.id));
  const selectNode = useCallback((id, focus = false) => { setSelectedId(id); setSelectedEdgeId(null); if (focus) setMode('local'); }, []);
  const selectEdge = useCallback(id => { setSelectedEdgeId(id); }, []);
  const drawerNode = drawer?.kind === 'node' ? graph.nodes.find(node => node.id === drawer.id) : null;
  const drawerEdge = drawer?.kind === 'edge' ? graph.links.find(edge => edge.id === drawer.id) : null;
  const drawerEvidence = drawer?.kind === 'evidence' ? drawer.evidence : null;

  const showInspector = !!(questionId || selectedNode || selectedEdge);
  const related = selectedNode ? graph.links.filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id) : [];
  const summaryFields = selectedNode ? Object.entries(selectedNode).filter(([key]) =>
    !['id', 'label', 'type', 'objectType', 'color', 'size', 'alert', 'dataset', 'product_name', 'ingredient_name'].includes(key)).slice(0, questionId ? 2 : 4) : [];

  return <div className="graph-workspace" style={{ '--graph-surface': token.colorBgContainer, '--graph-bg': token.colorBgLayout, '--graph-border': token.colorBorderSecondary, '--graph-muted': token.colorTextSecondary, '--graph-text': token.colorText, '--graph-accent': token.colorPrimary }}>
    <header className="graph-heading">
      <div><Title level={4} style={{ margin: 0 }}><ApartmentOutlined /> {zh ? '图谱探索' : 'Graph Explorer'}</Title>
        <Text type="secondary">{displayed.nodes.length} {zh ? '个对象' : 'objects'} · {mode === 'global' && displayed.links.length !== filteredLinks.length ? `${displayed.links.length} / ${filteredLinks.length}` : displayed.links.length} {zh ? '条关系' : 'relationships'}{mode === 'local' && selectedNode ? ` · ${zh ? '聚焦' : 'Focus'}: ${selectedNode.label || selectedNode.id}` : ''}</Text></div>
      <Space>{evaluationId && <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/verified-qa?${new URLSearchParams({run:evaluationId,case:evaluationCase||''})}`)}>{zh?'返回评测':'Back to evaluation'}</Button>}{conversationId && <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/agent?${new URLSearchParams({ ...replayContext, conversation: conversationId, ...(turnId ? { turn: turnId } : {}) })}`)}>{zh ? '返回本轮回答' : 'Back to answer'}</Button>}<Tag>{zh ? '运行时图谱' : 'Runtime graph'}</Tag></Space>
    </header>
    <div className="graph-toolbar">
      <Select className="graph-search" showSearch allowClear suffixIcon={<SearchOutlined />} aria-label={zh ? '查找对象' : 'Find an object'} placeholder={zh ? '搜索对象名称或 ID' : 'Search objects by name or ID'} value={selectedId || undefined}
        optionFilterProp="label" onChange={value => value ? selectNode(value, true) : (setSelectedId(null), setMode('global'))}
        options={graph.nodes.map(node => ({ value: node.id, label: `${node.label || node.id} · ${node.id}` }))} />
      <Space.Compact className="graph-view-switch"><Button type={mode === 'global' ? 'primary' : 'default'} onClick={() => setMode('global')}>{zh ? '全图' : 'Overview'}</Button>
        <Button type={mode === 'local' ? 'primary' : 'default'} disabled={!selectedId} onClick={() => setMode('local')}>{zh ? '聚焦分析' : 'Focus'}</Button></Space.Compact>
      {mode === 'local' && <Select aria-label={zh ? '邻域范围' : 'Neighborhood'} className="graph-depth" value={depth} onChange={setDepth} options={[{ value: 1, label: zh ? '一跳' : '1 hop' }, { value: 2, label: zh ? '两跳' : '2 hops' }]} />}
      {mode === 'global' && overviewLinks.length < filteredLinks.length && <Button onClick={() => setShowAllRelations(!showAllRelations)}>{showAllRelations ? (zh ? '精简关系' : 'Simplify links') : (zh ? '显示全部关系' : 'Show all links')}</Button>}
      <Popover trigger="click" placement="bottomRight" title={zh ? '关系类型' : 'Relationships'} content={<Checkbox.Group value={enabledTypes || relationTypes} onChange={setEnabledTypes} className="graph-checkboxes" options={relationTypes.map(value => ({ value, label: value }))} />}>
        <Button icon={<FilterOutlined />}>{zh ? '关系筛选' : 'Relationships'}</Button>
      </Popover>
      <Button icon={<ReloadOutlined />} onClick={load}>{zh ? '刷新' : 'Refresh'}</Button>
    </div>
    <div className="graph-legend-row"><span className="graph-legend-label">{zh ? '对象类型' : 'Object types'}</span>
      {types.map(type => <span className="graph-legend" key={type}><i style={{ background: typeColor(type) }} />{type}</span>)}
    </div>
    <div className={`graph-stage${showInspector ? ' graph-stage-with-inspector' : ''}`}>
      <section className="graph-canvas" aria-label={zh ? '图谱画布' : 'Graph canvas'}>
        {loading ? <div className="graph-centered"><Spin /></div> : error ? <div className="graph-centered"><Alert type="error" showIcon title={error} action={<Button onClick={load}>{zh ? '重试' : 'Retry'}</Button>} /></div> : !displayed.nodes.length ? <div className="graph-centered"><Empty description={zh ? '暂无图谱数据' : 'No graph data'} /></div> :
          <SigmaGraph data={displayed} mode={mode} selectedId={selectedId} highlightedEdges={highlighted} onNodeSelect={selectNode} onEdgeSelect={selectEdge} zh={zh} />}
        <div className="graph-canvas-caption">{mode === 'local' && selectedNode ? (zh ? '选择节点探索邻域' : 'Select a node to explore its neighborhood') : !showAllRelations && overviewLinks.length < filteredLinks.length ? (zh ? '精简概览 · 每个对象按关系类型展示一条真实关系' : 'Simplified overview · One real relationship per object and type') : (zh ? '选择对象以查看关系' : 'Select an object to inspect its relationships')}</div>
      </section>
      {showInspector && <aside className="graph-inspector" data-testid="graph-evidence-panel">
        {selectedEdge ? <>
          <div className="graph-inspector-kicker">{zh ? '关系' : 'RELATIONSHIP'}</div>
          <Title level={5}>{selectedEdge.linkType}</Title>
          <Text type="secondary">{selectedEdge.source} → {selectedEdge.target}</Text>
          <Button className="graph-detail-button" onClick={() => setDrawer({ kind: 'edge', id: selectedEdge.id })}>{zh ? '查看关系详情' : 'View relationship details'}</Button>
        </> : selectedNode && <>
          <div className="graph-inspector-kicker"><i style={{ background: typeColor(selectedNode.objectType || selectedNode.type) }} />{selectedNode.objectType || selectedNode.type}</div>
          <Title level={5} className="graph-inspector-title">{selectedNode.label || selectedNode.id}</Title>
          <Text code className="graph-node-id">{selectedNode.id}</Text>
          {summaryFields.length > 0 && <div className="graph-inspector-section"><div className="graph-section-title">{zh ? '对象属性' : 'Object details'}</div>
            {summaryFields.map(([key, value]) => <div className="graph-property" key={key}><span>{key}</span><span>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</span></div>)}
            <Button type="link" size="small" className="graph-inline-link" onClick={() => setDrawer({ kind: 'node', id: selectedNode.id })}>{zh ? '查看全部属性' : 'View all properties'}</Button>
          </div>}
          {!questionId && related.length > 0 && <div className="graph-inspector-section"><div className="graph-section-title">{zh ? '相关关系' : 'Related relationships'} <span>{related.length}</span></div>
            {related.slice(0, 8).map(edge => { const id = edge.source === selectedNode.id ? edge.target : edge.source; const node = graph.nodes.find(item => item.id === id); return <button className="graph-related" type="button" key={edge.id} onClick={() => selectNode(id)}><span>{edge.linkType}</span><strong>{node?.label || id}</strong></button>; })}
          </div>}
        </>}
        {answerError && <Alert type="warning" showIcon title={answerError} />}
        {runtimePath.length > 0 && !loading && !error && <div className="graph-inspector-section">
          <div className="graph-section-title">{zh ? '本轮查询关系' : 'Query relationship'}</div>
          <div role="status" className={`graph-match ${match.missing.length ? 'is-missing' : 'is-found'}`}>
            <strong>{match.missing.length ? (zh ? '当前图谱中未找到该关系' : 'Relationship is absent from the current graph') : (zh ? '已匹配本轮查询关系' : 'Query relationship matched')}</strong>
            <span>{runtimePath[0].source_id} → {relation} → {targetNode}</span>
            <span>{zh ? '依据当前图谱核对；只有匹配到的关系会高亮。' : 'Checked against the current graph; only matching relationships are highlighted.'}</span>
          </div>
        </div>}
        {questionId && !answer && !answerError && <Spin size="small" />}
        {answer && <div className="graph-inspector-section graph-answer">
          <div className="graph-section-title">{zh ? '问题证据' : 'Question evidence'} <span>{answer.question_id}</span></div>
          <Space wrap><Tag color={answer.status === 'unknown' ? 'orange' : 'green'}>{answer.status}</Tag><Tag>{zh ? '样例文件' : 'Answer from sample files'}</Tag></Space>
          <p>{answer.conclusion}</p>
          {answer.unknown_reasons?.length > 0 && <Alert type="warning" showIcon title={zh ? '证据不足' : 'Insufficient evidence'} description={answer.unknown_reasons.join(', ')} />}
          {match.steps.length > 0 && (loading ? <Spin size="small" /> : !error && <div role="status" className={`graph-match ${match.missing.length ? 'is-missing' : 'is-found'}`}>
            <strong>{match.missing.length ? (zh ? '运行时图中未找到完整路径' : 'The full path is not present in the runtime graph') : (zh ? '已在运行时图中找到关系' : 'Relationship found in runtime graph')}</strong>
            <span>{visibleMatches.length < match.edges.length ? (zh ? '部分匹配关系被当前筛选或局部视图隐藏。答案仍来自样例文件。' : 'Some matching relationships are hidden by the current filter or focus. The answer still comes from sample files.') : (zh ? '图中高亮仅表示关系匹配；样例答案仍来自文件。' : 'Highlighting shows a matching relationship; the answer still comes from the sample files.')}</span>
          </div>)}
          {answer.path?.length > 0 && <div className="graph-evidence-list">{answer.path.map((step, index) => <div key={`${step.source_id}-${step.relation}-${step.target_id}-${index}`}><Text code>{step.source_id}</Text><span> → {step.relation} → </span><Text code>{step.target_id}</Text></div>)}</div>}
          <div className="graph-source-heading">{zh ? '来源记录' : 'Source records'}</div>
          {answer.evidence?.map(item => <button className="graph-source" type="button" key={item.evidence_id} onClick={() => setDrawer({ kind: 'evidence', evidence: item })}><span>{item.source_path.split('/').pop()}</span><small>{item.field}</small></button>)}
        </div>}
      </aside>}
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
