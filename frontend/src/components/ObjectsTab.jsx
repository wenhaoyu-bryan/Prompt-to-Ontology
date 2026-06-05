import { useState, useMemo } from 'react';
import {
  Package, FlaskConical, Shield, Users, Calendar, Search, Eye, GitBranch, Zap,
  Truck, Cpu, Factory, Activity, Layers,
} from 'lucide-react';
import EntityInspector from './EntityInspector';

// ══════════════════════════════════════════════════════
// Type config
// ══════════════════════════════════════════════════════

const TYPE_META = {
  PetFoodProduct: { icon: Package, color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20', label: '宠物食品' },
  Brand:          { icon: Package, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', label: '品牌' },
  Ingredient:     { icon: FlaskConical, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', label: '成分' },
  RiskRule:       { icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: '风险规则' },
  Species:        { icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: '物种' },
  LifeStage:      { icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', label: '生命阶段' },
  Supplier:       { icon: Truck, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', label: '供应商' },
  RawMaterial:    { icon: FlaskConical, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: '原材料' },
  Component:      { icon: Cpu, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: '零部件' },
  FinalProduct:   { icon: Package, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', label: '最终产品' },
  Factory:        { icon: Factory, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', label: '工厂' },
};

const DEFAULT_META = { icon: Activity, color: 'text-neutral-400', bg: 'bg-neutral-800', border: 'border-neutral-700', label: '未知' };

// ══════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════

export default function ObjectsTab({
  graphData, selectedNode, nodeDetail,
  onNodeClick, onNavigateToNode, onRunAgent,
  refreshGraph, refreshDetail,
}) {
  const [activeType, setActiveType] = useState('PetFoodProduct');
  const [searchQuery, setSearchQuery] = useState('');

  // Group nodes by type
  const grouped = useMemo(() => {
    const groups = {};
    for (const node of graphData.nodes) {
      const t = node.objectType || node.type || 'Other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(node);
    }
    return groups;
  }, [graphData.nodes]);

  // Build outgoing link map for quick access
  const outgoingMap = useMemo(() => {
    const map = {};
    for (const link of graphData.links) {
      if (!map[link.source]) map[link.source] = [];
      map[link.source].push(link);
    }
    return map;
  }, [graphData.links]);

  // Types with counts
  const types = useMemo(() => {
    return Object.keys(grouped)
      .sort((a, b) => {
        const order = ['PetFoodProduct', 'Brand', 'Ingredient', 'RiskRule', 'Species', 'LifeStage',
          'Supplier', 'RawMaterial', 'Component', 'FinalProduct', 'Factory'];
        return order.indexOf(a) - order.indexOf(b);
      })
      .map(t => ({
        type: t,
        count: grouped[t].length,
        ...(TYPE_META[t] || DEFAULT_META),
      }));
  }, [grouped]);

  // Filtered nodes for the active type
  const filteredNodes = useMemo(() => {
    const nodes = grouped[activeType] || [];
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter(n =>
      (n.label || '').toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    );
  }, [grouped, activeType, searchQuery]);

  const activeMeta = TYPE_META[activeType] || DEFAULT_META;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: Type Selector ── */}
      <aside className="w-48 shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-y-auto">
        <div className="px-3 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-white">对象类型</span>
          </div>
        </div>
        <div className="py-1">
          {types.map(t => (
            <button
              key={t.type}
              onClick={() => { setActiveType(t.type); setSearchQuery(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                activeType === t.type
                  ? `${t.bg} ${t.border} border-l-2`
                  : 'border-l-2 border-transparent hover:bg-neutral-900/50'
              }`}
            >
              <t.icon className={`w-3.5 h-3.5 ${activeType === t.type ? t.color : 'text-neutral-600'}`} />
              <span className={`text-xs flex-1 ${activeType === t.type ? 'text-white font-medium' : 'text-neutral-400'}`}>
                {t.label}
              </span>
              <span className={`text-[10px] ${activeType === t.type ? 'text-neutral-300' : 'text-neutral-600'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Center: Object List ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Search bar */}
        <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-950 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <activeMeta.icon className={`w-4 h-4 ${activeMeta.color}`} />
            <h2 className="text-sm font-semibold text-white">{activeMeta.label}</h2>
            <span className="text-[10px] text-neutral-500">{filteredNodes.length} 个对象</span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`搜索${activeMeta.label}...`}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white pl-8 pr-3 py-2 outline-none focus:border-blue-500/50 placeholder-neutral-600"
            />
          </div>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-600 gap-2">
              <Search className="w-6 h-6 opacity-30" />
              <p className="text-xs">无匹配对象</p>
            </div>
          ) : activeType === 'PetFoodProduct' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredNodes.map(node => (
                <ProductCard
                  key={node.id}
                  node={node}
                  outgoing={outgoingMap[node.id] || []}
                  isSelected={selectedNode?.id === node.id}
                  onSelect={() => onNodeClick(node)}
                  onViewGraph={() => onNavigateToNode(node)}
                  onExplainRisk={() => onRunAgent(node.id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredNodes.map(node => (
                <GenericObjectRow
                  key={node.id}
                  node={node}
                  meta={activeMeta}
                  outgoing={outgoingMap[node.id] || []}
                  isSelected={selectedNode?.id === node.id}
                  onSelect={() => onNodeClick(node)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Entity Inspector ── */}
      <aside className="w-96 shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col">
        <EntityInspector
          selectedNode={selectedNode}
          nodeDetail={nodeDetail}
          refreshGraph={refreshGraph}
          refreshDetail={refreshDetail}
          onNavigateToNode={onNavigateToNode}
          onRunAgent={onRunAgent}
        />
      </aside>
    </div>
  );
}


// ══════════════════════════════════════════════════════
// Product Card
// ══════════════════════════════════════════════════════

function ProductCard({ node, outgoing, isSelected, onSelect, onViewGraph, onExplainRisk }) {
  const riskLinks = outgoing.filter(l => l.linkType === 'TRIGGERS_RISK');
  const brandLink = outgoing.find(l => l.linkType === 'MADE_BY');

  const sevRank = { critical: 3, high: 3, medium: 2, low: 1 };
  const maxSev = riskLinks.reduce((m, l) => Math.max(m, sevRank[l.severity] || 0), 0);
  const riskLevel = maxSev >= 3 ? 'High' : maxSev >= 2 ? 'Medium' : 'Low';
  const riskColor = { High: 'red', Medium: 'amber', Low: 'green' }[riskLevel];
  const riskLabel = { High: 'High Risk', Medium: 'Medium Risk', Low: 'No Risk' }[riskLevel];

  const species = node.target_species;
  const speciesLabel = { cat: '猫', dog: '狗', cat_or_dog: '猫/狗' }[species] || species || '—';
  const stage = node.life_stage;
  const stageLabel = { kitten: '幼猫', puppy: '幼犬', adult: '成年', senior: '老年', all_life_stages: '全阶段' }[stage] || stage || '—';
  const categoryLabel = { dry_food: '干粮', wet_food: '湿粮', treat: '零食', supplement: '营养补充' }[node.category] || node.category || '—';

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20'
          : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/80'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-bold text-white leading-tight truncate flex-1">
            {node.label || node.product_name || node.id}
          </h3>
          <RiskBadge level={riskLevel} color={riskColor} label={riskLabel} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {brandLink && (
            <span className="text-cyan-400 font-medium">{brandLink.targetLabel}</span>
          )}
          {brandLink && <span className="text-neutral-600">|</span>}
          <span className="text-neutral-400">{speciesLabel}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{stageLabel}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{categoryLabel}</span>
        </div>

        {riskLinks.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-red-400">触发 {riskLinks.length} 条风险规则</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-neutral-800/50 flex items-center gap-1.5">
        <button
          onClick={e => { e.stopPropagation(); onSelect(); }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
        >
          <Eye className="w-3 h-3" /> 详情
        </button>
        <button
          onClick={e => { e.stopPropagation(); onViewGraph(); }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
        >
          <GitBranch className="w-3 h-3" /> 图谱
        </button>
        {riskLinks.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onExplainRisk(); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors"
          >
            <Zap className="w-3 h-3" /> 解释风险
          </button>
        )}
      </div>
    </div>
  );
}


function RiskBadge({ level, color, label }) {
  const cls = {
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    green: 'bg-green-500/15 text-green-400 border-green-500/20',
  };
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${cls[color] || cls.green}`}>
      {label}
    </span>
  );
}


// ══════════════════════════════════════════════════════
// Generic Object Row (non-product types)
// ══════════════════════════════════════════════════════

function GenericObjectRow({ node, meta, outgoing, isSelected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
        isSelected
          ? 'bg-blue-500/5 border border-blue-500/20'
          : 'hover:bg-neutral-900/50 border border-transparent'
      }`}
    >
      <meta.icon className={`w-4 h-4 ${meta.color} shrink-0`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-white truncate block">{node.label || node.id}</span>
        <span className="text-[10px] text-neutral-600 font-mono">{node.id}</span>
      </div>
      {outgoing.length > 0 && (
        <span className="text-[10px] text-neutral-600 shrink-0">{outgoing.length} links</span>
      )}
    </button>
  );
}
