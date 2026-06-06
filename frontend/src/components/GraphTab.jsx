import { useState, useMemo, useCallback } from 'react';
import { GitBranch, Globe, Filter, ChevronDown, Eye } from 'lucide-react';
import D3GraphCanvas from './D3GraphCanvas';
import EntityInspector from './EntityInspector';

const LINK_TYPES = [
  { key: 'MADE_BY', label: 'Brand', color: 'text-cyan-400' },
  { key: 'CONTAINS', label: 'Ingredient', color: 'text-green-400' },
  { key: 'TRIGGERS_RISK', label: 'Risk', color: 'text-red-400' },
  { key: 'TARGETS_SPECIES', label: 'Species', color: 'text-purple-400' },
  { key: 'SUITABLE_FOR', label: 'Life Stage', color: 'text-amber-400' },
];

export default function GraphTab({
  graphData, graphLoading, graphError,
  selectedNode, nodeDetail, queriedNodeIds, highlightedNodeIds,
  onNodeClick, onNavigateToNode, onRunAgent,
  refreshGraph, refreshDetail, loadGraph,
  datasets, currentDataset, onDatasetChange,
}) {
  const [viewMode, setViewMode] = useState('local');
  const [depth, setDepth] = useState(1);
  const [disabledTypes, setDisabledTypes] = useState(new Set());
  const [showDetail, setShowDetail] = useState(true);

  const toggleType = useCallback((key) => {
    setDisabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Compute local subgraph
  const localGraphData = useMemo(() => {
    if (viewMode === 'global' || !selectedNode) return graphData;

    const nodeId = selectedNode.id;
    const allNodes = graphData.nodes;
    const allLinks = graphData.links;

    // Filter links by enabled types
    const activeLinks = allLinks.filter(l => !disabledTypes.has(l.linkType));

    // BFS to find nodes within `depth` hops
    const adjacency = {};
    for (const link of activeLinks) {
      if (!adjacency[link.source]) adjacency[link.source] = [];
      if (!adjacency[link.target]) adjacency[link.target] = [];
      adjacency[link.source].push(link.target);
      adjacency[link.target].push(link.source);
    }

    const visited = new Set([nodeId]);
    let frontier = [nodeId];
    for (let d = 0; d < depth; d++) {
      const nextFrontier = [];
      for (const nid of frontier) {
        for (const neighbor of (adjacency[nid] || [])) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            nextFrontier.push(neighbor);
          }
        }
      }
      frontier = nextFrontier;
    }

    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    const filteredNodes = [...visited].map(id => nodeMap.get(id)).filter(Boolean);
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = activeLinks.filter(l =>
      filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target)
    );

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, viewMode, selectedNode, depth, disabledTypes]);

  const showLocalPrompt = viewMode === 'local' && !selectedNode;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Controls sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto flex flex-col">
        <div className="px-3 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-white">Graph Controls</span>
          </div>

          {/* View Mode */}
          <div className="space-y-2">
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider">View Mode</label>
            <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
              <button
                onClick={() => setViewMode('local')}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                  viewMode === 'local'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                <Eye className="w-3 h-3 inline mr-1" /> Local
              </button>
              <button
                onClick={() => setViewMode('global')}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors border-l border-neutral-700 ${
                  viewMode === 'global'
                    ? 'bg-purple-500/10 text-purple-400'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                <Globe className="w-3 h-3 inline mr-1" /> Global
              </button>
            </div>
          </div>

          {/* Depth selector (only for local) */}
          {viewMode === 'local' && (
            <div className="mt-3 space-y-2">
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider">Depth</label>
              <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                {[1, 2, 3].map(d => (
                  <button
                    key={d}
                    onClick={() => setDepth(d)}
                    className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                      d > 1 ? 'border-l border-neutral-700' : ''
                    } ${
                      depth === d
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                    }`}
                  >
                    {d}-hop
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Link type toggles */}
        <div className="px-3 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-1.5 mb-2">
            <Filter className="w-3 h-3 text-neutral-500" />
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Relationship Types</span>
          </div>
          <div className="space-y-1">
            {LINK_TYPES.map(lt => (
              <button
                key={lt.key}
                onClick={() => toggleType(lt.key)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                  disabledTypes.has(lt.key)
                    ? 'text-neutral-600 line-through'
                    : 'text-neutral-300 hover:bg-neutral-900/50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  disabledTypes.has(lt.key) ? 'bg-neutral-700' : 'bg-current'
                } ${lt.color}`} />
                <span className="text-xs flex-1">{lt.label}</span>
                <span className="text-[10px] font-mono text-neutral-600">{lt.key}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected node info */}
        {selectedNode && (
          <div className="px-3 py-3 border-b border-neutral-800">
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5 block">Current Node</label>
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-2.5 py-2">
              <p className="text-xs text-white font-medium truncate">{selectedNode.label || selectedNode.id}</p>
              <p className="text-[10px] text-neutral-600 font-mono">{selectedNode.id}</p>
              <p className="text-[10px] text-neutral-500 mt-1">{selectedNode.objectType || selectedNode.type}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="px-3 py-3 mt-auto">
          <div className="text-[10px] text-neutral-600 space-y-1">
            <p>Nodes: {localGraphData.nodes.length} / {graphData.nodes.length}</p>
            <p>Edges: {localGraphData.links.length} / {graphData.links.length}</p>
          </div>
        </div>
      </aside>

      {/* ── Graph canvas ── */}
      <div className="flex-1 overflow-hidden relative">
        {showLocalPrompt ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-3 px-8">
            <GitBranch className="w-10 h-10 opacity-20" />
            <p className="text-sm text-center leading-relaxed">
              Select an object to view its local graph
            </p>
            <p className="text-xs text-neutral-700 text-center">
              Select an object in the Objects tab, or switch to Global Graph
            </p>
            <button
              onClick={() => setViewMode('global')}
              className="mt-2 px-4 py-2 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:brightness-110 transition-all"
            >
              <Globe className="w-3.5 h-3.5 inline mr-1.5" />
              Switch to Global Graph
            </button>
          </div>
        ) : (
          <D3GraphCanvas
            graphData={localGraphData}
            graphLoading={graphLoading}
            graphError={graphError}
            onRetry={() => loadGraph(currentDataset === 'all' ? undefined : currentDataset)}
            selectedNode={selectedNode}
            queriedNodeIds={queriedNodeIds}
            highlightedNodeIds={highlightedNodeIds}
            onNodeClick={onNodeClick}
            onRunAgent={onRunAgent}
            datasets={datasets}
            currentDataset={currentDataset}
            onDatasetChange={onDatasetChange}
          />
        )}
      </div>

      {/* ── Right detail panel ── */}
      {showDetail && (
        <aside className="w-80 shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col">
          <EntityInspector
            selectedNode={selectedNode}
            nodeDetail={nodeDetail}
            refreshGraph={refreshGraph}
            refreshDetail={refreshDetail}
            onNavigateToNode={onNavigateToNode}
            onRunAgent={onRunAgent}
          />
        </aside>
      )}
    </div>
  );
}
