import { useState, useEffect } from 'react';
import { Network, Database, Link2, AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Shield, Zap, FileText } from 'lucide-react';

const CLASS_COLORS = [
  { dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { dot: 'bg-purple-400', text: 'text-purple-400', bg: 'bg-purple-400/10' },
  { dot: 'bg-green-400', text: 'text-green-400', bg: 'bg-green-400/10' },
  { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10' },
  { dot: 'bg-blue-400', text: 'text-blue-400', bg: 'bg-blue-400/10' },
  { dot: 'bg-pink-400', text: 'text-pink-400', bg: 'bg-pink-400/10' },
];

const SEVERITY_COLORS = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-green-400 bg-green-500/10 border-green-500/20',
};

export default function OntologySchemaOverview({ dataset }) {
  const [domain, setDomain] = useState('pet_food');
  const [schema, setSchema] = useState(null);
  const [petFoodSchema, setPetFoodSchema] = useState(null);
  const [violations, setViolations] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Industrial schema (from Neo4j)
  useEffect(() => {
    if (domain !== 'industrial') return;
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
  }, [dataset, domain]);

  // Pet food schema (from YAML)
  useEffect(() => {
    if (domain !== 'pet_food') return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/ontology/pet_food/schema')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (!cancelled) setPetFoodSchema(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [domain]);

  if (loading) {
    return (
      <div className="h-12 shrink-0 border-b border-neutral-800 flex items-center px-4 gap-2">
        <DomainSelector domain={domain} onChange={setDomain} />
        <div className="w-3.5 h-3.5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <span className="text-[10px] text-neutral-500">加载 Schema...</span>
      </div>
    );
  }

  // Pet food domain view
  if (domain === 'pet_food') {
    if (!petFoodSchema || !petFoodSchema.objectTypes) {
      return (
        <div className="h-12 shrink-0 border-b border-neutral-800 flex items-center px-4 gap-2">
          <DomainSelector domain={domain} onChange={setDomain} />
          <Network className="w-3.5 h-3.5 text-neutral-600 mr-1" />
          <span className="text-[10px] text-neutral-500">Pet Food Schema 未加载 · 请先启动后端</span>
        </div>
      );
    }
    return <PetFoodSchemaView schema={petFoodSchema} collapsed={collapsed} setCollapsed={setCollapsed} domain={domain} setDomain={setDomain} />;
  }

  // Industrial domain view (original)
  if (!schema || !schema.stats || schema.stats.classCount === 0) {
    return (
      <div className="h-12 shrink-0 border-b border-neutral-800 flex items-center px-4 gap-2">
        <DomainSelector domain={domain} onChange={setDomain} />
        <Network className="w-3.5 h-3.5 text-neutral-600 mr-1" />
        <span className="text-[10px] text-neutral-500">Industrial Demo 暂无数据 · 请通过流水线导入或切换到 Pet Food Ontology</span>
      </div>
    );
  }

  const violationCount = violations?.violations?.length || 0;

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className="h-9 shrink-0 border-b border-neutral-800 bg-neutral-900/40
                   flex items-center px-4 cursor-pointer hover:bg-neutral-800/40 transition-colors gap-2"
      >
        <DomainSelector domain={domain} onChange={setDomain} />
        <Network className="w-3 h-3 text-purple-400 mr-1" />
        <span className="text-[10px] font-medium text-neutral-300">本体 Schema</span>
        <span className="text-[9px] text-neutral-500">
          {schema.stats.classCount} 类 · {schema.stats.relationshipTypeCount} 种关系
        </span>
        {violationCount > 0 && (
          <span className="text-[9px] text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> {violationCount} 违反
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-neutral-500 ml-auto" />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-2">
          <DomainSelector domain={domain} onChange={setDomain} />
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

      <div className="px-4 pb-1.5 flex gap-1.5 overflow-x-auto">
        {(schema.classes || []).map((cls, i) => (
          <ClassCard key={cls.name} cls={cls} colorStyle={CLASS_COLORS[i % CLASS_COLORS.length]} />
        ))}
      </div>

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


// ---- Domain Selector ----

function DomainSelector({ domain, onChange }) {
  return (
    <select
      value={domain}
      onChange={(e) => onChange(e.target.value)}
      className="text-[9px] bg-neutral-800 border border-neutral-700 text-neutral-300 rounded px-1.5 py-0.5
                 cursor-pointer hover:border-neutral-600 focus:outline-none focus:border-cyan-500/50"
    >
      <option value="pet_food">Pet Food Ontology</option>
      <option value="industrial">Industrial Demo</option>
    </select>
  );
}


// ---- Pet Food Schema View ----

function PetFoodSchemaView({ schema, collapsed, setCollapsed, domain, setDomain }) {
  const objectTypes = Object.entries(schema.objectTypes || {});
  const linkTypes = Object.entries(schema.linkTypes || {});
  const rules = Object.entries(schema.rules || {});
  const actionTypes = Object.entries(schema.actionTypes || {});
  const constraints = schema.constraints || {};

  const totalProps = objectTypes.reduce((sum, [, ot]) => sum + (ot.properties?.length || 0), 0);

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className="h-9 shrink-0 border-b border-neutral-800 bg-neutral-900/40
                   flex items-center px-4 cursor-pointer hover:bg-neutral-800/40 transition-colors gap-2"
      >
        <DomainSelector domain={domain} onChange={setDomain} />
        <Network className="w-3 h-3 text-purple-400" />
        <span className="text-[10px] font-medium text-neutral-300">Pet Food Ontology</span>
        <span className="text-[9px] text-neutral-500">
          {objectTypes.length} 类型 · {linkTypes.length} 关系 · {rules.length} 规则
        </span>
        <ChevronDown className="w-3 h-3 text-neutral-500 ml-auto" />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-neutral-800 bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-2">
          <DomainSelector domain={domain} onChange={setDomain} />
          <Network className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[10px] font-semibold text-white">Pet Food Ontology</span>
          <span className="text-[9px] text-neutral-500">
            {objectTypes.length} 类型 · {totalProps} 属性 · {linkTypes.length} 关系 · {rules.length} 规则 · {actionTypes.length} 动作
          </span>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-neutral-500 hover:text-neutral-300">
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>

      {/* Object Types */}
      <div className="px-4 pb-1.5">
        <div className="text-[8px] text-neutral-600 mb-1 uppercase tracking-wider">Object Types</div>
        <div className="flex gap-1.5 overflow-x-auto">
          {objectTypes.map(([name, ot], i) => (
            <PetFoodClassCard key={name} name={name} ot={ot} colorStyle={CLASS_COLORS[i % CLASS_COLORS.length]} />
          ))}
        </div>
      </div>

      {/* Link Types */}
      <div className="px-4 pb-1.5">
        <div className="text-[8px] text-neutral-600 mb-1 uppercase tracking-wider">Link Types</div>
        <div className="flex gap-1.5 overflow-x-auto">
          {linkTypes.map(([name, lt]) => (
            <div key={name} className="bg-neutral-900/40 border border-neutral-800 rounded-lg px-2.5 py-1 flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] text-cyan-400 font-mono">{lt.from || '?'}</span>
              <div className="flex items-center gap-0.5">
                <Link2 className="w-2 h-2 text-purple-400" />
                <span className="text-[8px] text-purple-400 font-semibold">{name}</span>
              </div>
              <span className="text-[9px] text-cyan-400 font-mono">{lt.to || '?'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rules */}
      {rules.length > 0 && (
        <div className="px-4 pb-1.5">
          <div className="text-[8px] text-neutral-600 mb-1 uppercase tracking-wider flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" /> Rules
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {rules.map(([key, rule]) => (
              <RuleChip key={key} ruleKey={key} rule={rule} />
            ))}
          </div>
        </div>
      )}

      {/* Action Types */}
      {actionTypes.length > 0 && (
        <div className="px-4 pb-1.5">
          <div className="text-[8px] text-neutral-600 mb-1 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> Actions
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {actionTypes.map(([name, at]) => (
              <div key={name} className="bg-neutral-900/40 border border-neutral-800 rounded-lg px-2.5 py-1 shrink-0">
                <div className="text-[9px] text-green-400 font-semibold">{name}</div>
                <div className="text-[7px] text-neutral-500 truncate max-w-[120px]">{at.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function PetFoodClassCard({ name, ot, colorStyle }) {
  const [expanded, setExpanded] = useState(false);
  const props = ot.properties || [];

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-2.5 py-1.5 min-w-[120px]
                 cursor-pointer hover:border-neutral-600 transition-colors shrink-0"
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={`w-2 h-2 rounded-full ${colorStyle.dot}`} />
        <span className="text-[10px] font-bold text-white">{name}</span>
      </div>
      {ot.description && (
        <div className="text-[7px] text-neutral-500 truncate max-w-[100px]">{ot.description}</div>
      )}
      <div className="flex items-center gap-2 text-[8px] text-neutral-500 mt-0.5">
        <span>{props.length} 属性</span>
      </div>

      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-neutral-800 space-y-0.5 max-h-28 overflow-y-auto">
          {props.map((prop, j) => (
            <div key={j} className="flex items-center gap-1 text-[8px]">
              <span className="text-neutral-400 font-mono truncate w-20">{prop}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function RuleChip({ ruleKey, rule }) {
  const sev = rule.severity || 'medium';
  const sevColor = SEVERITY_COLORS[sev] || SEVERITY_COLORS.medium;

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg px-2.5 py-1 shrink-0 max-w-[180px]">
      <div className="flex items-center gap-1.5">
        <Shield className="w-2 h-2 text-amber-400" />
        <span className="text-[9px] font-semibold text-white truncate">{rule.name || ruleKey}</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className={`text-[7px] px-1 rounded border ${sevColor}`}>{sev}</span>
        {rule.condition?.type && (
          <span className="text-[7px] text-neutral-500">{rule.condition.type}</span>
        )}
      </div>
    </div>
  );
}


// ---- Original Industrial Components ----

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
