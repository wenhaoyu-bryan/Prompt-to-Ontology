import { useState, useEffect } from 'react';
import { Network, Database, Link2, AlertTriangle, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

const CLASS_COLORS = [
  { dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { dot: 'bg-purple-400', text: 'text-purple-400', bg: 'bg-purple-400/10' },
  { dot: 'bg-green-400', text: 'text-green-400', bg: 'bg-green-400/10' },
  { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10' },
  { dot: 'bg-blue-400', text: 'text-blue-400', bg: 'bg-blue-400/10' },
  { dot: 'bg-pink-400', text: 'text-pink-400', bg: 'bg-pink-400/10' },
];

export default function OntologySchemaOverview({ dataset }) {
  const [schema, setSchema] = useState(null);
  const [violations, setViolations] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = dataset && dataset !== 'all' ? `?dataset=${dataset}` : '';
    Promise.all([
      fetch(`/api/ontology/schema${params}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/ontology/violations${params}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([s, v]) => {
        if (!cancelled) {
          setSchema(s);
          setViolations(v);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataset]);

  if (loading) {
    return (
      <div className="h-12 shrink-0 border-b border-neutral-800 flex items-center px-4">
        <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <span className="text-[10px] text-neutral-500 ml-2">提取本体 Schema...</span>
      </div>
    );
  }

  if (!schema || !schema.stats || schema.stats.classCount === 0) {
    return (
      <div className="h-12 shrink-0 border-b border-neutral-800 flex items-center px-4">
        <Network className="w-3.5 h-3.5 text-neutral-600 mr-2" />
        <span className="text-[10px] text-neutral-500">尚无数据 · 请先通过流水线导入 CSV</span>
      </div>
    );
  }

  const violationCount = violations?.violations?.length || 0;

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className="h-9 shrink-0 border-b border-neutral-800 bg-neutral-900/40
                   flex items-center px-4 cursor-pointer hover:bg-neutral-800/40 transition-colors"
      >
        <Network className="w-3 h-3 text-purple-400 mr-2" />
        <span className="text-[10px] font-medium text-neutral-300">本体 Schema</span>
        <span className="text-[9px] text-neutral-500 ml-2">
          {schema.stats.classCount} 类 · {schema.stats.relationshipTypeCount} 种关系
        </span>
        {violationCount > 0 && (
          <span className="text-[9px] text-amber-400 ml-2 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> {violationCount} 违反
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-neutral-500 ml-auto" />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-neutral-800 bg-neutral-950">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-2">
          <Network className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[10px] font-semibold text-white">本体 Schema</span>
          <span className="text-[9px] text-neutral-500">
            {schema.stats.classCount} 类 · {schema.stats.relationshipTypeCount} 种关系 · {schema.stats.totalNodes.toLocaleString()} 实例
          </span>
        </div>
        <div className="flex items-center gap-2">
          {violationCount > 0 ? (
            <span className="text-[9px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> {violationCount} 项违反
            </span>
          ) : (
            <span className="text-[9px] text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> 数据合规
            </span>
          )}
          <button onClick={() => setCollapsed(true)} className="text-neutral-500 hover:text-neutral-300">
            <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 类卡片行 */}
      <div className="px-4 pb-1.5 flex gap-1.5 overflow-x-auto">
        {(schema.classes || []).map((cls, i) => (
          <ClassCard key={cls.name} cls={cls} colorStyle={CLASS_COLORS[i % CLASS_COLORS.length]} />
        ))}
      </div>

      {/* 关系行 */}
      {(schema.relationships || []).length > 0 && (
        <div className="px-4 pb-1.5 flex gap-1.5 overflow-x-auto">
          {(schema.relationships || []).map((rel) => (
            <RelationshipChip key={rel.type} rel={rel} />
          ))}
        </div>
      )}
    </div>
  );
}


function ClassCard({ cls, colorStyle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-2.5 py-1.5 min-w-[120px]
                 cursor-pointer hover:border-neutral-600 transition-colors shrink-0"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={`w-2 h-2 rounded-full ${colorStyle.dot}`} />
        <span className="text-[10px] font-bold text-white">{cls.name}</span>
      </div>
      <div className="flex items-center gap-2 text-[8px] text-neutral-500">
        <span><Database className="w-2 h-2 inline" /> {cls.count.toLocaleString()}</span>
        <span>{cls.properties.length} 属性</span>
      </div>

      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-neutral-800 space-y-0.5 max-h-28 overflow-y-auto">
          {cls.properties.slice(0, 10).map((prop, j) => (
            <div key={j} className="flex items-center gap-1 text-[8px]">
              <span className="text-neutral-400 font-mono truncate w-16">{prop.name}</span>
              <span className={colorStyle.text}>{prop.type}</span>
              <span className="text-neutral-600 ml-auto">{prop.coverage}%</span>
            </div>
          ))}
          {cls.properties.length > 10 && (
            <span className="text-[8px] text-neutral-600">+{cls.properties.length - 10} 更多</span>
          )}
        </div>
      )}
    </div>
  );
}


function RelationshipChip({ rel }) {
  const mainPattern = rel.patterns[0];
  if (!mainPattern) return null;

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] text-cyan-400 font-mono">{mainPattern.from}</span>
      <div className="flex items-center gap-0.5">
        <Link2 className="w-2 h-2 text-purple-400" />
        <span className="text-[8px] text-purple-400 font-semibold">{rel.type}</span>
        <span className="text-[7px] text-neutral-600">({rel.cardinality})</span>
      </div>
      <span className="text-[9px] text-cyan-400 font-mono">{mainPattern.to}</span>
      <span className="text-[8px] text-neutral-600">{rel.count.toLocaleString()}</span>
    </div>
  );
}
