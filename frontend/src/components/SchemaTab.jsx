import { useState, useEffect } from 'react';
import {
  Network, Database, Link2, AlertTriangle, Shield, Zap,
  ChevronDown, ChevronRight, FileText, Layers, Activity,
  Server, CheckCircle, ExternalLink, Info,
} from 'lucide-react';
import { getDomainConfig, DEFAULT_DOMAIN } from '../domainConfig';

export default function SchemaTab({ graphData, currentDomain = DEFAULT_DOMAIN }) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const domainCfg = getDomainConfig(currentDomain);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(domainCfg.schemaEndpoint)
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (!cancelled) setSchema(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [domainCfg.schemaEndpoint]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-xs text-neutral-500">Loading Schema...</span>
        </div>
      </div>
    );
  }

  if (!schema || !schema.objectTypes) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-3">
        <Network className="w-8 h-8 opacity-20" />
        <p className="text-xs">Pet Food Schema not loaded</p>
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
            <h2 className="text-base font-bold text-white">Pet Food Schema</h2>
            <p className="text-xs text-neutral-500">
              {objectTypes.length} types · {totalProps} properties · {linkTypes.length} link types · {rules.length} rules · {actionTypes.length} actions
            </p>
          </div>
        </div>

        {/* Data Source Status */}
        <DataSourcePanel graphData={graphData} riskEdgeCount={riskEdgeCount} domainCfg={domainCfg} />

        {/* Health Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-cyan-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            <div><p className="text-[10px] text-neutral-500">Object Types</p><p className="text-lg font-bold text-cyan-400">{objectTypes.length}</p></div>
          </div>
          <div className="bg-green-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Database className="w-4 h-4 text-green-400" />
            <div><p className="text-[10px] text-neutral-500">Instances</p><p className="text-lg font-bold text-green-400">{graphData.nodes.length}</p></div>
          </div>
          <div className="bg-purple-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Link2 className="w-4 h-4 text-purple-400" />
            <div><p className="text-[10px] text-neutral-500">Link Types</p><p className="text-lg font-bold text-purple-400">{linkTypes.length}</p></div>
          </div>
          <div className="bg-amber-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-amber-400" />
            <div><p className="text-[10px] text-neutral-500">Relationships</p><p className="text-lg font-bold text-amber-400">{graphData.links.length}</p></div>
          </div>
          <div className="bg-red-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-red-400" />
            <div><p className="text-[10px] text-neutral-500">Risk Rules</p><p className="text-lg font-bold text-red-400">{rules.length}</p></div>
          </div>
          <div className="bg-orange-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <div><p className="text-[10px] text-neutral-500">Risk Edges</p><p className="text-lg font-bold text-orange-400">{riskEdgeCount}</p></div>
          </div>
          <div className="bg-green-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-green-400" />
            <div><p className="text-[10px] text-neutral-500">Actions</p><p className="text-lg font-bold text-green-400">{actionTypes.length}</p></div>
          </div>
          <div className="bg-blue-500/10 border border-neutral-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-blue-400" />
            <div><p className="text-[10px] text-neutral-500">Total Props</p><p className="text-lg font-bold text-blue-400">{totalProps}</p></div>
          </div>
        </div>

        {/* Object Types */}
        <Section title="Object Types" icon={Layers} count={objectTypes.length}
          explanation="Each object type represents a category of domain entities. Objects are modeled as types because users need to inspect them, connect them through relationships, evaluate rules against them, and ask the agent questions about them.">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {objectTypes.map(([typeName, typeDef], i) => (
              <ExplainableObjectTypeCard key={typeName} typeName={typeName} typeDef={typeDef} colorIndex={i}
                instanceCount={nodeCounts[typeName] || 0} linkTypes={linkTypes} />
            ))}
          </div>
        </Section>

        {/* Properties */}
        <Section title="Properties" icon={FileText} count={totalProps}
          explanation="Properties describe an object directly as typed values. For example, fat_100g is a property of PetFoodProduct because it is a numeric value used by rules. It is not modeled as a separate node because users do not need to inspect fat as an independent object.">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {objectTypes.map(([typeName, typeDef]) => (
              <div key={typeName} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2">
                <div className="text-[10px] font-semibold text-white mb-1">{typeName}</div>
                <div className="flex flex-wrap gap-1">
                  {(typeDef.properties || []).map((p, j) => (
                    <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                      {typeof p === 'string' ? p : p.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Link Types */}
        <Section title="Link Types" icon={Link2} count={linkTypes.length}
          explanation="Link types define the allowed relationships between objects. Each link has a direction (from → to) and a business meaning. Links are how the graph encodes domain knowledge — rules and agent questions depend on these relationships to find evidence.">
          <div className="space-y-2">
            {linkTypes.map(([name, lt]) => (
              <ExplainableLinkRow key={name} name={name} lt={lt} />
            ))}
          </div>
        </Section>

        {/* Rules */}
        {rules.length > 0 && (
          <Section title="Rules" icon={Shield} count={rules.length}
            explanation="Rules evaluate instance data against conditions. When a condition is met, a TRIGGERS_RISK edge is created with severity, evidence, and reason. Rules can also return passed (data complete, not triggered), not_evaluable (missing data), or not_applicable (wrong species/life_stage).">
            <div className="space-y-2">
              {rules.map(([key, rule]) => (
                <ExplainableRuleRow key={key} ruleKey={key} rule={rule} />
              ))}
            </div>
          </Section>
        )}

        {/* Constraints */}
        <Section title="Constraints" icon={AlertTriangle} count={5}
          explanation="Constraints check whether the graph follows the ontology schema. They validate object types, required properties, enum values, link directions, and required edge fields before data is imported.">
          <div className="space-y-1.5">
            {[
              'PetFoodProduct must have product_id and product_name',
              'target_species must be cat, dog, cat_or_dog, or unknown',
              'CONTAINS must connect PetFoodProduct to Ingredient',
              'TRIGGERS_RISK must include severity, evidence, and reason',
              'MADE_BY must connect PetFoodProduct to Brand',
            ].map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-neutral-300">{c}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Actions */}
        {actionTypes.length > 0 && (
          <Section title="Actions" icon={Zap} count={actionTypes.length}
            explanation="Actions are operations that can be performed on objects. They are triggered by users or agents and use graph data as input.">
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

        {/* Ontology Success Checklist */}
        <OntologySuccessChecklist />
      </div>
    </div>
  );
}


function DataSourcePanel({ graphData, riskEdgeCount, domainCfg }) {
  const rows = [
    { label: 'Current Domain', value: domainCfg.key, color: 'text-cyan-400' },
    { label: 'Data Source', value: domainCfg.dataSource, color: 'text-neutral-300' },
    { label: 'Import Mode', value: 'auto-seeded sample data', color: 'text-neutral-300' },
    { label: 'Object Instances', value: graphData.nodes.length, color: 'text-green-400' },
    { label: 'Relationships', value: graphData.links.length, color: 'text-green-400' },
    { label: 'Risk Edges', value: riskEdgeCount, color: riskEdgeCount > 0 ? 'text-orange-400' : 'text-green-400' },
    { label: 'Validation Status', value: 'Passed', color: 'text-green-400', icon: CheckCircle },
    { label: 'Last Imported', value: 'current session', color: 'text-neutral-500' },
  ];

  return (
    <div className="border border-neutral-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-neutral-900/40">
        <Server className="w-3.5 h-3.5 text-neutral-400" />
        <span className="text-xs font-semibold text-white">Data Source Status</span>
      </div>
      <div className="px-4 pb-3 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-1">
            <span className="text-[10px] text-neutral-500">{row.label}</span>
            <span className={`text-xs font-medium flex items-center gap-1 ${row.color}`}>
              {row.icon && <row.icon className="w-3 h-3" />}
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <div className="px-4 pb-3 flex items-center gap-1.5">
        <Info className="w-3 h-3 text-neutral-600" />
        <span className="text-[9px] text-neutral-600">
          Data contract defined in
        </span>
        <a
          href="https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/blob/pet-food-ontology-mvp/docs/ready-data-contract.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-cyan-500 hover:text-cyan-400 flex items-center gap-0.5"
        >
          docs/ready-data-contract.md
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}


function Section({ title, icon: Icon, count, children, explanation }) {
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
        <div className="p-4 space-y-3">
          {explanation && (
            <p className="text-[10px] text-neutral-400 leading-relaxed bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2">
              {explanation}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}


const _DOT_COLORS = ['bg-cyan-400', 'bg-purple-400', 'bg-green-400', 'bg-amber-400', 'bg-blue-400', 'bg-pink-400'];
const _TEXT_COLORS = ['text-cyan-400', 'text-purple-400', 'text-green-400', 'text-amber-400', 'text-blue-400', 'text-pink-400'];

function ExplainableObjectTypeCard({ typeName, typeDef, colorIndex = 0, instanceCount, linkTypes }) {
  const [expanded, setExpanded] = useState(false);
  const props = typeDef.properties || [];
  const dotColor = _DOT_COLORS[colorIndex % _DOT_COLORS.length];
  const textColor = _TEXT_COLORS[colorIndex % _TEXT_COLORS.length];

  // Find connected link types
  const connectedLinks = (linkTypes || [])
    .filter(([_, lt]) => lt.from === typeName || lt.to === typeName)
    .map(([name]) => name);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5 cursor-pointer hover:border-neutral-600 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-xs font-bold text-white">{typeName}</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{instanceCount} instances</span>
      </div>
      {typeDef.description && (
        <p className="text-[9px] text-neutral-400 mb-1">{typeDef.description}</p>
      )}
      <div className="text-[10px] text-neutral-500">{props.length} properties</div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-neutral-800 space-y-2 max-h-48 overflow-y-auto">
          <div>
            <span className="text-[9px] text-neutral-500 uppercase tracking-wider">Properties</span>
            <div className="mt-1 space-y-0.5">
              {props.map((prop, j) => (
                <div key={j} className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-neutral-400 font-mono">{typeof prop === 'string' ? prop : prop.name}</span>
                  {typeof prop !== 'string' && prop.type && (
                    <span className={textColor}>{prop.type}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {connectedLinks.length > 0 && (
            <div>
              <span className="text-[9px] text-neutral-500 uppercase tracking-wider">Connected Links</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {connectedLinks.map((l, j) => (
                  <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


const LINK_EXPLANATIONS = {
  MADE_BY: 'Matters because brand is a key dimension for product comparison and risk analysis.',
  CONTAINS: 'Matters because rules and agent questions depend on ingredient relationships, such as products containing chicken or cat foods missing taurine.',
  TARGETS_SPECIES: 'Matters because rules filter by species — e.g. taurine rules only apply to cat food.',
  SUITABLE_FOR: 'Matters because life stage determines which nutrition thresholds apply — kitten and senior have different requirements.',
  TRIGGERS_RISK: 'Matters because this is the evidence edge: it records which rule was triggered, why, and with what severity.',
  SIMILAR_TO: 'Matters because it enables the agent to recommend alternatives based on product similarity.',
};

function ExplainableLinkRow({ name, lt }) {
  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-cyan-400 font-mono">{lt.from || '?'}</span>
        <Link2 className="w-3 h-3 text-purple-400" />
        <span className="text-xs text-purple-400 font-semibold">{name}</span>
        <span className="text-[10px] text-cyan-400 font-mono">{lt.to || '?'}</span>
      </div>
      {lt.description && (
        <p className="text-[10px] text-neutral-400 mb-1">{lt.description}</p>
      )}
      {LINK_EXPLANATIONS[name] && (
        <p className="text-[9px] text-neutral-500 italic">{LINK_EXPLANATIONS[name]}</p>
      )}
    </div>
  );
}


function ExplainableRuleRow({ ruleKey, rule }) {
  const sev = rule.severity || 'medium';
  const sevClass = sev === 'critical' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : sev === 'high' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    : sev === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-green-400 bg-green-500/10 border-green-500/20';

  const cond = rule.condition || {};
  const inputDesc = cond.type === 'nutrition_threshold'
    ? `${cond.field} (${cond.operator} ${cond.value})`
    : cond.type === 'ingredient_absence'
    ? `target_species=${cond.target_species}, missing_ingredient=${cond.missing_ingredient}`
    : cond.type === 'ingredient_match'
    ? `match_ingredients: ${(cond.match_ingredients || []).join(', ')}`
    : cond.type === 'compound'
    ? `species=${cond.target_species}, life_stage=${cond.life_stage}, nutrition check`
    : cond.type || '—';

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-white">{rule.name || ruleKey}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${sevClass}`}>{sev}</span>
      </div>
      {rule.explanation && (
        <p className="text-[10px] text-neutral-400 mb-1.5">{rule.explanation}</p>
      )}
      <div className="grid grid-cols-3 gap-2 text-[9px]">
        <div>
          <span className="text-neutral-600 uppercase tracking-wider">Inputs</span>
          <p className="text-neutral-400 font-mono mt-0.5">{inputDesc}</p>
        </div>
        <div>
          <span className="text-neutral-600 uppercase tracking-wider">Output</span>
          <p className="text-neutral-400 mt-0.5">Product → TRIGGERS_RISK → Rule</p>
        </div>
        <div>
          <span className="text-neutral-600 uppercase tracking-wider">Condition Type</span>
          <p className="text-neutral-400 font-mono mt-0.5">{cond.type || '—'}</p>
        </div>
      </div>
    </div>
  );
}


function OntologySuccessChecklist() {
  const items = [
    'Object types are defined',
    'Properties are typed',
    'Link types are defined',
    'Constraints validate graph shape',
    'Instance data exists',
    'Objects are connected through links',
    'Rules evaluate instance data',
    'Triggered rules generate evidence',
    'Missing data is marked as not_evaluable',
    'Agent can answer using graph-grounded tools',
  ];

  return (
    <div className="border border-green-500/20 rounded-xl overflow-hidden bg-green-500/5">
      <div className="flex items-center gap-2 px-4 py-3">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <span className="text-xs font-semibold text-white">Ontology Success Checklist</span>
      </div>
      <div className="px-4 pb-3">
        <p className="text-[10px] text-neutral-400 mb-2">
          Ontology construction is successful if all of the following are true.
          This is more than graph visualization — it is a working operational ontology.
        </p>
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
              <span className="text-neutral-300">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
