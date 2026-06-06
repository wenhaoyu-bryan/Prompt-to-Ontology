import { useState, useEffect, useCallback } from 'react';
import { Factory, Package, GitBranch, Network, Bot, Database } from 'lucide-react';
import ObjectsTab from './components/ObjectsTab';
import GraphTab from './components/GraphTab';
import SchemaTab from './components/SchemaTab';
import AgentTab from './components/AgentTab';
import { fetchGraph, fetchNodeDetail, fetchHighlightPath, runAgentChat, executeAction, fetchDatasets } from './api';
import { getDomainConfig, DEFAULT_DOMAIN } from './domainConfig';

// ══════════════════════════════════════════════════════
// Tab config
// ══════════════════════════════════════════════════════

const TABS = [
  { id: 'objects', label: 'Objects', icon: Package },
  { id: 'graph',   label: 'Graph',   icon: GitBranch },
  { id: 'schema',  label: 'Schema',  icon: Network },
  { id: 'agent',   label: 'Agent',   icon: Bot },
];

// ══════════════════════════════════════════════════════
// App
// ══════════════════════════════════════════════════════

export default function App() {
  // ── Core state ──
  const [mainTab, setMainTab] = useState('objects');
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [queriedNodeIds, setQueriedNodeIds] = useState([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState([]);
  const [currentDataset, setCurrentDataset] = useState('pet_food');
  const [datasets, setDatasets] = useState([]);
  const [currentDomain, setCurrentDomain] = useState(DEFAULT_DOMAIN);
  const domainCfg = getDomainConfig(currentDomain);

  // ── Data loading ──
  const loadGraph = useCallback(async (dataset) => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await fetchGraph(dataset);
      setGraphData(data);
    } catch (e) {
      console.error('Graph load failed', e);
      setGraphError(e.message || 'Cannot connect to backend');
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => { loadGraph('pet_food'); }, [loadGraph]);

  useEffect(() => {
    fetchDatasets().then((ds) => {
      setDatasets(ds);
      const pf = ds.find(d => d.name === 'pet_food');
      if (pf) {
        setCurrentDataset('pet_food');
        loadGraph('pet_food');
      } else {
        const builtIn = ds.find(d => d.builtIn);
        if (builtIn) {
          setCurrentDataset(builtIn.name);
          loadGraph(builtIn.name);
        }
      }
    }).catch(() => {});
  }, []);

  // ── Node interaction ──
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
      console.error('Node detail load failed', e);
      setNodeDetail(null);
    }
  }, []);

  const handleNavigateToNode = useCallback(async (nodeOrId) => {
    let node;
    if (typeof nodeOrId === 'string') {
      node = graphData.nodes.find(n => n.id === nodeOrId);
      if (!node) node = { id: nodeOrId };
    } else {
      node = nodeOrId;
    }
    handleNodeClick(node);
  }, [graphData.nodes, handleNodeClick]);

  const handleRunAgent = useCallback((nodeId) => {
    // Find the node and select it, then switch to agent tab
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
      fetchNodeDetail(nodeId).then(setNodeDetail).catch(() => {});
    }
    setMainTab('agent');
  }, [graphData.nodes]);

  const handleDatasetChange = useCallback((ds) => {
    setCurrentDataset(ds);
    loadGraph(ds === 'all' ? undefined : ds);
  }, [loadGraph]);

  // ── Stats ──
  const stats = {
    total: graphData.nodes.length,
    alerts: graphData.nodes.filter(n => n.alert).length,
    links: graphData.links.length,
  };

  // ── Render ──
  return (
    <div className="flex flex-col h-screen bg-neutral-950 overflow-hidden">
      {/* ── Header ── */}
      <header className="h-12 flex items-center justify-between px-5 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Factory className="w-3.5 h-3.5 text-white" />
          </div>
          <h1 className="text-sm font-bold text-white tracking-wide">
            Ontology OS
            <span className="ml-2 text-[10px] text-neutral-500 font-normal">Ready-data operational ontology runtime</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {graphError ? (
            <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">Disconnected</span>
          ) : graphLoading ? (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Loading</span>
          ) : (
            <>
              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                {stats.total} nodes
              </span>
              <span className="text-[10px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full border border-neutral-700">
                {stats.links} edges
              </span>
              {stats.alerts > 0 && (
                <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  {stats.alerts} alerts
                </span>
              )}
            </>
          )}
          <div className="h-4 w-px bg-neutral-700 mx-1" />
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3 text-neutral-600" />
            <select
              value={currentDataset}
              onChange={e => handleDatasetChange(e.target.value)}
              className="text-[10px] bg-neutral-900 border border-neutral-700 text-neutral-400 rounded px-1.5 py-0.5 cursor-pointer hover:border-neutral-600 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="pet_food">Pet Food</option>
              <option value="all">All</option>
              {datasets.filter(d => d.name !== 'pet_food').map(d => (
                <option key={d.name} value={d.name}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-neutral-800 bg-neutral-950 shrink-0 px-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              mainTab === tab.id
                ? 'text-blue-400 border-blue-500 bg-blue-500/5'
                : 'text-neutral-500 border-transparent hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {mainTab === 'objects' && (
          <ObjectsTab
            graphData={graphData}
            selectedNode={selectedNode}
            nodeDetail={nodeDetail}
            onNodeClick={handleNodeClick}
            onNavigateToNode={handleNavigateToNode}
            onRunAgent={handleRunAgent}
            refreshGraph={loadGraph}
            refreshDetail={async (id) => {
              const d = await fetchNodeDetail(id);
              setNodeDetail(d);
            }}
          />
        )}
        {mainTab === 'graph' && (
          <GraphTab
            graphData={graphData}
            graphLoading={graphLoading}
            graphError={graphError}
            selectedNode={selectedNode}
            nodeDetail={nodeDetail}
            queriedNodeIds={queriedNodeIds}
            highlightedNodeIds={highlightedNodeIds}
            onNodeClick={handleNodeClick}
            onNavigateToNode={handleNavigateToNode}
            onRunAgent={handleRunAgent}
            refreshGraph={loadGraph}
            refreshDetail={async (id) => {
              const d = await fetchNodeDetail(id);
              setNodeDetail(d);
            }}
            loadGraph={loadGraph}
            datasets={datasets}
            currentDataset={currentDataset}
            onDatasetChange={handleDatasetChange}
          />
        )}
        {mainTab === 'schema' && (
          <SchemaTab graphData={graphData} currentDomain={currentDomain} />
        )}
        {mainTab === 'agent' && (
          <AgentTab selectedNode={selectedNode} nodeDetail={nodeDetail} />
        )}
      </div>
    </div>
  );
}
