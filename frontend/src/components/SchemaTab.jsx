import { useState, useEffect } from 'react';
import {
  Network, Database, Link2, AlertTriangle, Shield, Zap,
  ChevronDown, ChevronRight, FileText, Layers, Activity,
} from 'lucide-react';

export default function SchemaTab({ graphData }) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/ontology/pet_food/schema')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (!cancelled) setSchema(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-xs text-neutral-500">加载 Schema...</span>
        </div>
      </div>
    );
  }

  if (!schema || !schema.objectTypes) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-3">
        <Network className="w-8 h-8 opacity-20" />
        <p className="text-xs">Pet Food Schema 未加载</p>
      </div>
    );
  }

  const objectTypes = Object.entries(schema.objectTypes || {});
  const linkTypes = Object.entries(schema.linkTypes || {});
  const rules = Object.entries(schema.rules || {});
  const actionTypes = Object.entries(schema.actionTypes || {});
  const totalProps = objectTypes.reduce((sum, [, ot]) => sum + (ot.properties?.length || 0), 0);

  // Compute health stats from graphData
  const nodeCounts = {};
  for (const n of graphData.nodes) {
    const t = n.objectType || n.type || 'Other';
    nodeCounts[t] = (nodeCounts[t] || 0) + 1;
  }
  const riskEdgeCount = graphData.links.filter(l => l.linkType === 'TRIGGERS_RISK').length;

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Pet Food Ontology Schema</h2>
            <p className="text-xs text-neutral-500">
              {objectTypes.length} 类型 · {totalProps} 属性 · {linkTypes.length} 关系类型 · {rules.length} 规则 · {actionTypes.length} 动作
            </p>
          </div>
        </div>

        {/* Health Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-cyan-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            <div><p className="text-[10px] text-neutral-500">对象类型</p><p className="text-lg font-bold text-cyan-400">{objectTypes.length}</p></div>
          </div>
          <div className="bg-green-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Database className="w-4 h-4 text-green-400" />
            <div><p className="text-[10px] text-neutral-500">对象实例</p><p className="text-lg font-bold text-green-400">{graphData.nodes.length}</p></div>
          </div>
          <div className="bg-purple-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Link2 className="w-4 h-4 text-purple-400" />
            <div><p className="text-[10px] text-neutral-500">关系类型</p><p className="text-lg font-bold text-purple-400">{linkTypes.length}</p></div>
          </div>
          <div className="bg-amber-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-amber-400" />
            <div><p className="text-[10px] text-neutral-500">关系实例</p><p className="text-lg font-bold text-amber-400">{graphData.links.length}</p></div>
          </div>
          <div className="bg-red-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-red-400" />
            <div><p className="text-[10px] text-neutral-500">风险规则</p><p className="text-lg font-bold text-red-400">{rules.length}</p></div>
          </div>
          <div className="bg-orange-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <div><p className="text-[10px] text-neutral-500">风险边</p><p className="text-lg font-bold text-orange-400">{riskEdgeCount}</p></div>
          </div>
          <div className="bg-green-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-green-400" />
            <div><p className="text-[10px] text-neutral-500">动作定义</p><p className="text-lg font-bold text-green-400">{actionTypes.length}</p></div>
          </div>
          <div className="bg-blue-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-blue-400" />
            <div><p className="text-[10px] text-neutral-500">属性总数</p><p className="text-lg font-bold text-blue-400">{totalProps}</p></div>
          </div>
        </div>

        {/* Object Types */}
        <Section title="Object Types" icon={Layers} count={objectTypes.length}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {objectTypes.map(([typeName, typeDef], i) => (
              <ObjectTypeCard key={typeName} typeName={typeName} typeDef={typeDef} colorIndex={i}
                instanceCount={nodeCounts[typeName] || 0} />
            ))}
          </div>
        </Section>

        {/* Link Types */}
        <Section title="Link Types" icon={Link2} count={linkTypes.length}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {linkTypes.map(([name, lt]) => (
              <div key={name} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] text-cyan-400 font-mono">{lt.from || '?'}</span>
                <div className="flex items-center gap-1">
                  <Link2 className="w-3 h-3 text-purple-400" />
                  <span className="text-xs text-purple-400 font-semibold">{name}</span>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono">{lt.to || '?'}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Rules */}
        {rules.length > 0 && (
          <Section title="Rules" icon={Shield} count={rules.length}>
            <div className="space-y-2">
              {rules.map(([key, rule]) => (
                <RuleRow key={key} ruleKey={key} rule={rule} />
              ))}
            </div>
          </Section>
        )}

        {/* Actions */}
        {actionTypes.length > 0 && (
          <Section title="Actions" icon={Zap} count={actionTypes.length}>
            <div className="grid grid-cols-2 gap-2">
              {actionTypes.map(([name, at]) => (
                <div key={name} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2">
                  <div className="text-xs text-green-400 font-semibold">{name}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{at.description}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}


function Section({ title, icon: Icon, count, children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-neutral-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-neutral-900/40 hover:bg-neutral-900/60 transition-colors text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-neutral-600" /> : <ChevronDown className="w-3.5 h-3.5 text-neutral-600" />}
        <Icon className="w-3.5 h-3.5 text-neutral-400" />
        <span className="text-xs font-semibold text-white">{title}</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{count}</span>
      </button>
      {!collapsed && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}


const _DOT_COLORS = ['bg-cyan-400', 'bg-purple-400', 'bg-green-400', 'bg-amber-400', 'bg-blue-400', 'bg-pink-400'];
const _TEXT_COLORS = ['text-cyan-400', 'text-purple-400', 'text-green-400', 'text-amber-400', 'text-blue-400', 'text-pink-400'];

function ObjectTypeCard({ typeName, typeDef, colorIndex = 0, instanceCount }) {
  const [expanded, setExpanded] = useState(false);
  const props = typeDef.properties || [];
  const dotColor = _DOT_COLORS[colorIndex % _DOT_COLORS.length];
  const textColor = _TEXT_COLORS[colorIndex % _TEXT_COLORS.length];

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5 cursor-pointer hover:border-neutral-600 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-xs font-bold text-white">{typeName}</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{instanceCount} 实例</span>
      </div>
      {typeDef.description && (
        <p className="text-[9px] text-neutral-500 mb-1">{typeDef.description}</p>
      )}
      <div className="text-[10px] text-neutral-500">{props.length} 属性</div>

      {expanded && props.length > 0 && (
        <div className="mt-2 pt-2 border-t border-neutral-800 space-y-0.5 max-h-32 overflow-y-auto">
          {props.map((prop, j) => (
            <div key={j} className="flex items-center gap-1.5 text-[9px]">
              <span className="text-neutral-400 font-mono">{typeof prop === 'string' ? prop : prop.name}</span>
              {typeof prop !== 'string' && prop.type && (
                <span className={textColor}>{prop.type}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function RuleRow({ ruleKey, rule }) {
  const sev = rule.severity || 'medium';
  const sevClass = sev === 'critical' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : sev === 'high' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    : sev === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-green-400 bg-green-500/10 border-green-500/20';

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5 flex items-start gap-3">
      <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-white">{rule.name || ruleKey}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${sevClass}`}>{sev}</span>
        </div>
        {rule.explanation && (
          <p className="text-[10px] text-neutral-400">{rule.explanation}</p>
        )}
        {rule.condition?.type && (
          <p className="text-[9px] text-neutral-600 font-mono mt-1">{rule.condition.type}</p>
        )}
      </div>
    </div>
  );
}
