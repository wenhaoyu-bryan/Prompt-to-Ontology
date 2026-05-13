import { useState, useEffect, useCallback } from 'react';
import { Factory, Zap, Cpu, Layers, Upload, GitBranch, Bot, Brain, BarChart3 } from 'lucide-react';
import AgentWorkshop from './components/AgentWorkshop';
import OntologyBrowser from './components/OntologyBrowser';
import D3GraphCanvas from './components/D3GraphCanvas';
import EntityInspector from './components/EntityInspector';
import DataImporter from './components/DataImporter';
import DataPipeline from './components/DataPipeline';
import AgentStudio from './components/AgentStudio';
import ReasoningView from './components/ReasoningView';
import AnalysisView from './components/AnalysisView';
import { fetchGraph, fetchNodeDetail, fetchHighlightPath, runAgentChat, executeAction, fetchLlmConfig, fetchDatasets } from './api';

// ---- 左侧导航 Tab 子组件 ----
function NavTab({ icon: Icon, label, active, onClick, badge, disabled, comingSoon }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={comingSoon ? `${label}（即将推出）` : label}
      className={`
        w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5
        transition-all duration-200 relative group
        ${disabled
          ? 'text-neutral-600 cursor-default opacity-50'
          : active
            ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30'
            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
        }
      `}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[8px] leading-none">{label}</span>
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[7px] rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {comingSoon && (
        <span className="absolute -bottom-0.5 text-[6px] text-neutral-600 leading-none whitespace-nowrap">
          即将
        </span>
      )}
    </button>
  );
}

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [agentLogs, setAgentLogs] = useState([]);
  const [agentDecision, setAgentDecision] = useState(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [queriedNodeIds, setQueriedNodeIds] = useState([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState([]);

  // 左栏模式：browser | agent | import
  const [leftPanelMode, setLeftPanelMode] = useState('browser');

  // 视图模式：pipeline | graph（首页，看内置数据） | agent | reasoning | analysis
  const [viewMode, setViewMode] = useState('graph');

  // 数据集状态
  const [currentDataset, setCurrentDataset] = useState('all');
  const [datasets, setDatasets] = useState([]);

  // ==========================================
  // 数据加载
  // ==========================================
  const loadGraph = useCallback(async (dataset) => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await fetchGraph(dataset);
      setGraphData(data);
    } catch (e) {
      console.error('图谱加载失败', e);
      setGraphError(e.message || '无法连接到后端服务');
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const [llmConfig, setLlmConfig] = useState({});

  useEffect(() => { loadGraph(); }, [loadGraph]);

  useEffect(() => {
    fetchLlmConfig().then(setLlmConfig).catch(() => {});
  }, []);

  // 加载数据集列表，自动选中内置项目
  useEffect(() => {
    fetchDatasets().then((ds) => {
      setDatasets(ds);
      const builtIn = ds.find(d => d.builtIn);
      if (builtIn) {
        setCurrentDataset(builtIn.name);
        loadGraph(builtIn.name);
      }
    }).catch(() => {});
  }, []);

  // ==========================================
  // 节点交互
  // ==========================================
  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node);
    setNodeDetail(null);
    try {
      const detail = await fetchNodeDetail(node.id);
      setNodeDetail(detail);
      try {
        const hl = await fetchHighlightPath(node.id);
        if (hl.highlighted_node_ids) {
          setHighlightedNodeIds(hl.highlighted_node_ids);
        }
      } catch {}
    } catch (e) {
      console.error('节点详情加载失败', e);
      setNodeDetail(null);
    }
  }, []);

  const handleNavigateToNode = useCallback(async (nodeOrId) => {
    let node;
    if (typeof nodeOrId === 'string') {
      node = graphData.nodes.find(n => n.id === nodeOrId);
      if (!node) {
        node = { id: nodeOrId };
      }
    } else {
      node = nodeOrId;
    }
    handleNodeClick(node);
  }, [graphData.nodes, handleNodeClick]);

  // ==========================================
  // 智能体推理
  // ==========================================
  const handleRunAgent = useCallback(async (nodeId) => {
    setQueriedNodeIds([]);
    setAgentDecision(null);
    setAgentLogs([]);
    setIsAgentRunning(true);
    setLeftPanelMode('agent');

    if (!selectedNode || selectedNode.id !== nodeId) {
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        try {
          const detail = await fetchNodeDetail(nodeId);
          setNodeDetail(detail);
        } catch {}
      }
    }

    try {
      const result = await runAgentChat(nodeId);
      for (let i = 0; i < result.logs.length; i++) {
        await new Promise((r) => setTimeout(r, 600));
        setAgentLogs((prev) => [...prev, result.logs[i]]);
        const logEntry = result.logs[i];
        if (logEntry.type === 'tool_call' && logEntry.data?.params?.node_id) {
          setQueriedNodeIds((prev) => [...prev, logEntry.data.params.node_id]);
        }
        if (logEntry.type === 'observation' && logEntry.data?.affected_nodes) {
          const affectedIds = Object.keys(logEntry.data.affected_nodes).filter(id => id !== nodeId);
          setQueriedNodeIds((prev) => [...new Set([...prev, ...affectedIds])]);
        }
      }
      setAgentDecision(result.decision);
    } catch (e) {
      console.error('智能体推理失败', e);
    } finally {
      setIsAgentRunning(false);
    }
  }, [selectedNode, graphData.nodes]);

  const handleApprove = useCallback(async () => {
    if (!agentDecision) return;
    try {
      const result = await executeAction(agentDecision.action_name, agentDecision.params);
      setAgentLogs((prev) => [...prev, {
        step: prev.length + 1, type: 'result',
        icon: result.success ? '✅' : '❌', color: result.success ? 'green' : 'red',
        message: result.message || '执行完成',
        timestamp: new Date().toLocaleTimeString(),
      }]);
      setAgentDecision(null);
      await loadGraph();
      if (selectedNode) {
        const detail = await fetchNodeDetail(selectedNode.id);
        setNodeDetail(detail);
      }
    } catch (e) {
      console.error('动作执行失败', e);
    }
  }, [agentDecision, loadGraph, selectedNode]);

  const handleReject = useCallback(() => {
    setAgentLogs((prev) => [...prev, {
      step: prev.length + 1, type: 'result',
      icon: '🚫', color: 'red',
      message: '人工审批驳回：已取消本次业务操作。',
      timestamp: new Date().toLocaleTimeString(),
    }]);
    setAgentDecision(null);
  }, []);

  const handleBackToBrowser = useCallback(() => {
    setLeftPanelMode('browser');
    setHighlightedNodeIds([]);
  }, []);

  const handleImportSuccess = useCallback(() => {
    loadGraph();
    setLeftPanelMode('browser');
  }, [loadGraph]);

  const handlePipelineComplete = useCallback((opts) => {
    // 刷新数据集列表
    fetchDatasets().then((ds) => {
      setDatasets(ds);
      // 自动切到新导入的数据集
      const newDs = opts?.dataset;
      if (newDs) {
        setCurrentDataset(newDs);
        loadGraph(newDs);
      } else {
        loadGraph();
      }
    }).catch(() => loadGraph());
    setViewMode('graph');
  }, [loadGraph]);

  const handleDatasetChange = useCallback((ds) => {
    setCurrentDataset(ds);
    loadGraph(ds === 'all' ? undefined : ds);
  }, [loadGraph]);

  // ==========================================
  // 统计
  // ==========================================
  const stats = {
    total: graphData.nodes.length,
    alerts: graphData.nodes.filter(n => n.alert).length,
  };

  // ==========================================
  // UI
  // ==========================================
  return (
    <div className="flex flex-col h-screen bg-neutral-950 overflow-hidden">
      {/* ---- 顶部导航栏 ---- */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Factory className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base font-bold text-white tracking-wide">
            Ontology OS
            <span className="ml-2 text-xs text-neutral-500 font-normal">企业本体操作系统</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* 实时状态 */}
          {graphError ? (
            <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">未连接</span>
          ) : graphLoading ? (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">加载中</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                🟢 {stats.total} 节点
              </span>
              {stats.alerts > 0 && (
                <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  ⚠ {stats.alerts} 告警
                </span>
              )}
            </div>
          )}
          <div className="h-4 w-px bg-neutral-700" />
          {/* LLM 模型状态 */}
          {llmConfig.configured ? (
            <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
              🧠 {llmConfig.model || 'LLM'}
            </span>
          ) : llmConfig.backend && llmConfig.backend !== 'none' ? (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              ⚠ 模型未配置
            </span>
          ) : null}
        </div>
      </header>

      {/* ---- 主体：左侧窄导航 + 内容区 ---- */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧窄导航栏 */}
        <nav className="w-12 shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col items-center py-3 gap-1">
          {/* 已实现模块 */}
          <NavTab
            icon={GitBranch}
            label="流水线"
            active={viewMode === 'pipeline'}
            onClick={() => setViewMode('pipeline')}
          />
          <NavTab
            icon={Layers}
            label="图谱"
            active={viewMode === 'graph'}
            onClick={() => setViewMode('graph')}
            badge={stats.alerts}
          />

          {/* 分割线 */}
          <div className="w-6 h-px bg-neutral-800 my-1.5" />

          {/* 扩展模块 */}
          <NavTab
            icon={Bot}
            label="Agent"
            active={viewMode === 'agent'}
            onClick={() => setViewMode('agent')}
          />
          <NavTab
            icon={Brain}
            label="推理"
            active={viewMode === 'reasoning'}
            onClick={() => setViewMode('reasoning')}
          />
          <NavTab
            icon={BarChart3}
            label="分析"
            active={viewMode === 'analysis'}
            onClick={() => setViewMode('analysis')}
          />

          {/* 底部状态指示器 */}
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <div className="w-6 h-px bg-neutral-800 mb-1" />
            <div className="flex flex-col items-center gap-0.5">
              <Zap className="w-3 h-3 text-yellow-500/60" />
              <Cpu className="w-3 h-3 text-blue-500/60" />
              <Zap className="w-3 h-3 text-green-500/60" />
            </div>
          </div>
        </nav>

        {/* 内容区 */}
        {viewMode === 'pipeline' ? (
          <div className="flex-1 overflow-hidden">
            <DataPipeline
              onImportComplete={handlePipelineComplete}
              datasets={datasets}
              onDeleteDataset={async (dsName) => {
                const { clearDataset } = await import('./api');
                await clearDataset(dsName);
                fetchDatasets().then(setDatasets).catch(() => {});
                if (currentDataset === dsName) {
                  setCurrentDataset('all');
                  loadGraph();
                }
              }}
              onViewDataset={(dsName) => {
                setCurrentDataset(dsName);
                loadGraph(dsName);
                setViewMode('graph');
              }}
            />
          </div>
        ) : viewMode === 'agent' ? (
          <div className="flex-1 overflow-hidden">
            <AgentStudio />
          </div>
        ) : viewMode === 'reasoning' ? (
          <div className="flex-1 overflow-hidden">
            <ReasoningView />
          </div>
        ) : viewMode === 'analysis' ? (
          <div className="flex-1 overflow-hidden">
            <AnalysisView />
          </div>
        ) : (
          /* 三栏图谱视图（含可折叠流水线） */
          <div className="flex flex-1 overflow-hidden">
            {/* 左栏：本体浏览器 / 智能体工作区 / 数据导入 */}
            <aside className="w-96 shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col">
              {/* 模式切换标签栏 (非 Agent 模式时显示) */}
              {leftPanelMode !== 'agent' && (
                <div className="flex border-b border-neutral-800 shrink-0">
                  <button
                    onClick={() => setLeftPanelMode('browser')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
                      leftPanelMode === 'browser'
                        ? 'text-blue-400 border-blue-500 bg-blue-500/5'
                        : 'text-neutral-500 border-transparent hover:text-neutral-300'
                    }`}
                  >
                    <Layers className="w-3 h-3" /> 浏览器
                  </button>
                  <button
                    onClick={() => setLeftPanelMode('import')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
                      leftPanelMode === 'import'
                        ? 'text-green-400 border-green-500 bg-green-500/5'
                        : 'text-neutral-500 border-transparent hover:text-neutral-300'
                    }`}
                  >
                    <Upload className="w-3 h-3" /> 导入
                  </button>
                </div>
              )}
              {leftPanelMode === 'browser' && (
                <OntologyBrowser
                  graphData={graphData}
                  onNavigateToNode={handleNavigateToNode}
                  onRunAgent={handleRunAgent}
                />
              )}
              {leftPanelMode === 'agent' && (
                <AgentWorkshop
                  selectedNode={selectedNode}
                  agentLogs={agentLogs}
                  agentDecision={agentDecision}
                  isAgentRunning={isAgentRunning}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onBack={handleBackToBrowser}
                />
              )}
              {leftPanelMode === 'import' && (
                <DataImporter onImportSuccess={handleImportSuccess} />
              )}
            </aside>

            {/* 中栏：图谱画布 */}
            <div className="flex-1 overflow-hidden">
              <D3GraphCanvas
                graphData={graphData}
                graphLoading={graphLoading}
                graphError={graphError}
                onRetry={() => loadGraph(currentDataset === 'all' ? undefined : currentDataset)}
                selectedNode={selectedNode}
                queriedNodeIds={queriedNodeIds}
                highlightedNodeIds={highlightedNodeIds}
                onNodeClick={handleNodeClick}
                onRunAgent={handleRunAgent}
                datasets={datasets}
                currentDataset={currentDataset}
                onDatasetChange={handleDatasetChange}
              />
            </div>

            {/* 右栏：对象 360° 视图 */}
            <aside className="w-96 shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col">
              <EntityInspector
                selectedNode={selectedNode}
                nodeDetail={nodeDetail}
                refreshGraph={loadGraph}
                refreshDetail={async (id) => {
                  const d = await fetchNodeDetail(id);
                  setNodeDetail(d);
                }}
                onNavigateToNode={handleNavigateToNode}
                onRunAgent={handleRunAgent}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
