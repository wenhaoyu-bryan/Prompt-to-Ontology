import { useState, useMemo } from 'react';
import {
  FlaskConical, Cpu, Package, Truck, Factory, Wrench, Globe, Shield,
  ChevronDown, ChevronRight, Search, AlertTriangle, Layers, Eye, Zap,
} from 'lucide-react';

// 动态图标/颜色池
const ICON_POOL = [FlaskConical, Cpu, Package, Truck, Factory, Wrench, Globe, Shield];
const COLOR_POOL = [
  { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  { color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  { color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
  { color: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
];

// 保留已知类型的中文友好名称
const KNOWN_LABELS = {
  Supplier: '供应商', RawMaterial: '原材料', Component: '零部件',
  FinalProduct: '最终产品', Factory: '工厂', Plant: '工厂',
};

export default function OntologyBrowser({ graphData, onNavigateToNode, onRunAgent }) {
  // 动态类型配置
  const TYPE_CONFIG = useMemo(() => {
    const config = {};
    const types = [...new Set(graphData.nodes.map(n => n.objectType || n.type || 'Other'))].sort();
    types.forEach((type, i) => {
      config[type] = {
        label: KNOWN_LABELS[type] || type,
        icon: ICON_POOL[i % ICON_POOL.length],
        ...COLOR_POOL[i % COLOR_POOL.length],
      };
    });
    return config;
  }, [graphData.nodes]);
  const [expandedTypes, setExpandedTypes] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 按类型分组
  const grouped = useMemo(() => {
    const groups = {};
    for (const node of graphData.nodes) {
      const t = node.objectType || node.type || 'Other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(node);
    }
    // 排序：告警优先
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (b.alert ? 1 : 0) - (a.alert ? 1 : 0));
    }
    return groups;
  }, [graphData.nodes]);

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    const q = searchQuery.toLowerCase();
    const result = {};
    for (const [type, nodes] of Object.entries(grouped)) {
      const matched = nodes.filter(n =>
        (n.label || '').toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
      );
      if (matched.length > 0) result[type] = matched;
    }
    return result;
  }, [grouped, searchQuery]);

  const toggleType = (type) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const typeOrder = ['Supplier', 'RawMaterial', 'Component', 'FinalProduct', 'Factory'];
  const sortedTypes = Object.keys(filtered).sort(
    (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  const totalAlerts = graphData.nodes.filter(n => n.alert).length;
  const totalNodes = graphData.nodes.length;

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-white">本体浏览器</h2>
        </div>
        <p className="text-xs text-neutral-500">
          共 {totalNodes} 个对象
          {totalAlerts > 0 && (
            <span className="ml-1.5 text-red-400 font-medium">{totalAlerts} 个告警</span>
          )}
        </p>

        {/* 搜索 */}
        <div className="mt-2 relative">
          <Search className="w-3.5 h-3.5 text-neutral-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索对象..."
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white pl-8 pr-3 py-2 outline-none focus:border-blue-500/50 placeholder-neutral-600"
          />
        </div>
      </div>

      {/* 类型分组列表 */}
      <div className="flex-1 overflow-y-auto">
        {sortedTypes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-600 gap-2">
            <Search className="w-6 h-6 opacity-30" />
            <p className="text-xs">无匹配对象</p>
          </div>
        )}

        {sortedTypes.map(type => {
          const config = TYPE_CONFIG[type] || { label: type, icon: Layers, color: 'text-neutral-400', bg: 'bg-neutral-800', border: 'border-neutral-700' };
          const nodes = filtered[type];
          const isExpanded = expandedTypes.has(type) || searchQuery.trim() !== '';
          const alertCount = nodes.filter(n => n.alert).length;

          return (
            <div key={type} className="border-b border-neutral-800/50">
              {/* 类型头部 */}
              <button
                onClick={() => toggleType(type)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-neutral-900/50 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
                )}
                <config.icon className={`w-3.5 h-3.5 ${config.color}`} />
                <span className="text-xs font-medium text-neutral-300">{config.label}</span>
                <span className="text-[10px] text-neutral-600 ml-auto">{nodes.length}</span>
                {alertCount > 0 && (
                  <span className="text-[10px] text-red-400 font-medium flex items-center gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {alertCount}
                  </span>
                )}
              </button>

              {/* 节点列表 */}
              {isExpanded && (
                <div className="pb-1">
                  {nodes.map(node => {
                    const canRunAgent = node.alert
                      || (node.objectType === 'Supplier' && node.riskLevel === 'High')
                      || (node.objectType === 'FinalProduct' && node.yieldRatio != null && node.yieldRatio < 0.8)
                      || (node.objectType === 'Component' && node.daysRemaining != null && node.daysRemaining < 3);

                    return (
                    <div
                      key={node.id}
                      className="flex items-center gap-0.5 px-4 py-1 pl-10 hover:bg-neutral-800/50 transition-colors group"
                    >
                      {/* 主点击区：导航到节点 */}
                      <button
                        onClick={() => onNavigateToNode(node)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {/* 告警指示 */}
                        {node.alert && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                        )}
                        {!node.alert && <div className="w-1.5 shrink-0" />}

                        <span className="text-xs text-white truncate">{node.label}</span>
                        <span className="text-[10px] text-neutral-600 font-mono shrink-0">{node.id}</span>

                        {/* 关键指标 */}
                        <span className="text-[10px] text-neutral-500 shrink-0">
                          {node.objectType === 'RawMaterial' && node.stock != null && `${node.stock}${node.unit || 't'}`}
                          {node.objectType === 'Component' && node.daysRemaining != null && `${node.daysRemaining.toFixed(1)}d`}
                          {node.objectType === 'FinalProduct' && node.yieldRatio != null && `${(node.yieldRatio*100).toFixed(0)}%`}
                          {node.objectType === 'Supplier' && node.riskLevel && node.riskLevel}
                          {node.objectType === 'Factory' && node.capacityUtilization != null && `${(node.capacityUtilization*100).toFixed(0)}%`}
                        </span>
                      </button>

                      {/* 快速操作 */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* 智能体分析（仅告警/高风险节点） */}
                        {canRunAgent && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRunAgent(node.id); }}
                            className="p-1 rounded hover:bg-amber-500/20 text-amber-500 transition-colors"
                            title="启动智能体分析"
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* 图谱定位 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateToNode(node); }}
                          className="p-1 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                          title="在图谱中定位"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-950">
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(TYPE_CONFIG).map(([type, config]) => {
            const count = grouped[type]?.length || 0;
            if (count === 0) return null;
            return (
              <span key={type} className="text-[10px] text-neutral-600 flex items-center gap-1">
                <config.icon className="w-2.5 h-2.5 opacity-50" />
                {count}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
