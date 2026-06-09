import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, CheckCircle, Package, Truck, Factory, Cpu,
  FlaskConical, Shield, MapPin, Calendar, Users, Activity,
  ChevronDown, ChevronUp, ExternalLink, Info, Link2, Zap, ArrowRight,
} from 'lucide-react';

// ══════════════════════════════════════════════════════
// Utility components
// ══════════════════════════════════════════════════════

function ProgressBar({ value, max, color = 'bg-blue-500', label }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const danger = pct < 30;
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>{label || `${pct.toFixed(1)}%`}</span>
        {danger && <span className="text-red-400 font-medium">{t('entity.low')}</span>}
      </div>
      <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${danger ? 'bg-red-500' : color}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DataCard({ children, className = '' }) {
  return (
    <div className={`bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

function Badge({ label, color = 'neutral' }) {
  const colors = {
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    green: 'bg-green-500/15 text-green-400 border-green-500/20',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    neutral: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  };
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors[color] || colors.neutral}`}>
      {label}
    </span>
  );
}

// ══════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════

export default function EntityInspector({
  selectedNode, nodeDetail, refreshGraph, refreshDetail,
  onNavigateToNode, onRunAgent,
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  if (!selectedNode || !nodeDetail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-700 gap-3 px-4">
        <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
          <Cpu className="w-6 h-6 opacity-25" />
        </div>
        <p className="text-xs text-center leading-relaxed">
          {t('entity.emptyTitle')}
          <br />
          {t('entity.emptySubtitle')}
        </p>
        <p className="text-[10px] text-neutral-700">{t('entity.emptyHint')}</p>
      </div>
    );
  }

  const objType = nodeDetail.object_type || nodeDetail.objectType || '';
  const outgoing = nodeDetail.outgoing_links || [];
  const incoming = nodeDetail.incoming_links || [];

  // Dynamic labels/colors — use i18n for type labels
  const KNOWN_LABELS = t('entity.typeLabels', { returnObjects: true });
  const KNOWN_COLORS = { Supplier: 'red', RawMaterial: 'amber', Component: 'blue', FinalProduct: 'green', Factory: 'purple', Plant: 'purple', PetFoodProduct: 'pink', Brand: 'cyan', Ingredient: 'green', RiskRule: 'amber', Species: 'blue', LifeStage: 'purple' };
  const typeLabel = { [objType]: (typeof KNOWN_LABELS === 'object' ? KNOWN_LABELS[objType] : null) || objType };
  const typeColor = { [objType]: KNOWN_COLORS[objType] || 'neutral' };

  const tabs = [
    { id: 'overview', label: t('entity.overview'), icon: Info },
    { id: 'links', label: `${t('entity.links')} (${incoming.length + outgoing.length})`, icon: Link2 },
    { id: 'blast', label: t('entity.impact'), icon: AlertTriangle },
    { id: 'actions', label: t('entity.actions'), icon: Zap },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ---- Header ---- */}
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <TypeIcon type={objType} />
          <h2 className="text-sm font-semibold text-white truncate">{nodeDetail.name || nodeDetail.label || selectedNode.id}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-600 font-mono">{selectedNode.id}</span>
          <Badge label={typeLabel[objType] || t('entity.unknown')} color={typeColor[objType] || 'neutral'} />
          {nodeDetail.alert && <Badge label={t('entity.alert')} color="red" />}
        </div>
      </div>

      {/* ---- Tab bar ---- */}
      <div className="flex border-b border-neutral-800 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              activeTab === t.id
                ? 'text-blue-400 border-blue-500 bg-blue-500/5'
                : 'text-neutral-500 border-transparent hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- Content ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'overview' && (
          <OverviewTab objType={objType} detail={nodeDetail} />
        )}
        {activeTab === 'links' && (
          <LinksTab incoming={incoming} outgoing={outgoing} onNavigate={onNavigateToNode} />
        )}
        {activeTab === 'blast' && (
          <BlastRadiusTab nodeId={selectedNode.id} onNavigate={onNavigateToNode} />
        )}
        {activeTab === 'actions' && (
          <ActionsTab
            objType={objType}
            nodeId={selectedNode.id}
            detail={nodeDetail}
            onRunAgent={onRunAgent}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Overview tab
// ══════════════════════════════════════════════════════

function OverviewTab({ objType, detail }) {
  const { t } = useTranslation();
  if (objType === 'RawMaterial') return <RawMaterialOverview detail={detail} />;
  if (objType === 'Component') return <ComponentOverview detail={detail} />;
  if (objType === 'FinalProduct') return <FinalProductOverview detail={detail} />;
  if (objType === 'Supplier') return <SupplierOverview detail={detail} />;
  if (objType === 'Factory') return <FactoryOverview detail={detail} />;
  if (objType === 'PetFoodProduct') return <PetFoodProductOverview detail={detail} />;
  if (objType === 'Brand') return <BrandOverview detail={detail} />;
  if (objType === 'Ingredient') return <IngredientOverview detail={detail} />;
  if (objType === 'RiskRule') return <RiskRuleOverview detail={detail} />;
  if (objType === 'Species') return <SpeciesOverview detail={detail} />;
  if (objType === 'LifeStage') return <LifeStageOverview detail={detail} />;
  return <p className="text-xs text-neutral-500">{t('entity.unknownType')}</p>;
}

function RawMaterialOverview({ detail }) {
  const { t } = useTranslation();
  const stock = detail.stock || 0;
  const threshold = detail.threshold || 0;
  const isAlert = stock < threshold;
  const quality = detail.quality_score || detail.qualityScore || 0;
  const unit = detail.unit || 't';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">Current Stock</p>
          <p className={`text-xl font-bold ${isAlert ? 'text-red-400' : 'text-white'}`}>{stock}</p>
          <p className="text-[10px] text-neutral-600">{unit}</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">Safety Threshold</p>
          <p className="text-xl font-bold text-white">{threshold}</p>
          <p className="text-[10px] text-neutral-600">{unit}</p>
        </DataCard>
      </div>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Stock Level</p>
        <ProgressBar value={stock} max={threshold * 1.5} color="bg-amber-500"
          label={`${stock} / ${threshold} ${unit}`} />
      </DataCard>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Quality</p>
        <ProgressBar value={quality * 100} max={100} color="bg-blue-500" label={`Quality Score ${(quality * 100).toFixed(0)}%`} />
      </DataCard>

      {isAlert && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-300">Stock Alert</p>
            <p className="text-[10px] text-red-400/80">Deficit {(threshold - stock).toFixed(1)} {unit} — reorder immediately</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentOverview({ detail }) {
  const { t } = useTranslation();
  const stock = detail.stock || 0;
  const daily = detail.daily_consumption || detail.dailyConsumption || 0;
  const days = detail.days_remaining || detail.daysRemaining || (daily > 0 ? stock / daily : 0);
  const defect = detail.defect_rate || detail.defectRate || 0;
  const isAlert = days < 3;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">Stock</p>
          <p className="text-xl font-bold text-white">{stock}</p>
          <p className="text-[10px] text-neutral-600">{detail.unit || 'pcs'}</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">Daily Usage</p>
          <p className="text-xl font-bold text-white">{daily}</p>
          <p className="text-[10px] text-neutral-600">pcs/day</p>
        </DataCard>
      </div>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Days Remaining</p>
        <ProgressBar value={days} max={10} color={days < 3 ? 'bg-red-500' : 'bg-blue-500'}
          label={`${days.toFixed(1)} days`} />
      </DataCard>

      <DataCard>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-neutral-500">Defect Rate</span>
          <span className={`text-xs font-bold ${defect > 0.03 ? 'text-red-400' : 'text-green-400'}`}>
            {(defect * 100).toFixed(1)}%
          </span>
        </div>
      </DataCard>

      {isAlert && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-300">Critical Stock</p>
            <p className="text-[10px] text-red-400/80">Only {days.toFixed(1)} days of supply remaining</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FinalProductOverview({ detail }) {
  const { t } = useTranslation();
  const target = detail.target_yield || detail.targetYield || 0;
  const current = detail.current_yield || detail.currentYield || 0;
  const ratio = detail.yield_ratio || detail.yieldRatio || (target > 0 ? current / target : 0);
  const isAlert = ratio < 0.8;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">Target Yield</p>
          <p className="text-xl font-bold text-white">{target}</p>
          <p className="text-[10px] text-neutral-600">{detail.unit || 'units'}/mo</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">Actual Yield</p>
          <p className={`text-xl font-bold ${isAlert ? 'text-red-400' : 'text-white'}`}>{current}</p>
          <p className="text-[10px] text-neutral-600">{detail.unit || 'units'}/mo</p>
        </DataCard>
      </div>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Yield Achievement</p>
        <ProgressBar value={ratio * 100} max={100} color={isAlert ? 'bg-red-500' : 'bg-green-500'}
          label={`${(ratio * 100).toFixed(1)}%`} />
      </DataCard>

      {isAlert && (
        <DataCard>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-neutral-500">Yield Gap</span>
            <span className="text-xs font-bold text-red-400">{target - current} {detail.unit || 'units'}/mo</span>
          </div>
        </DataCard>
      )}

      {!isAlert && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-xs text-green-300">Target achieved — healthy</p>
        </div>
      )}
    </div>
  );
}

function SupplierOverview({ detail }) {
  const { t } = useTranslation();
  const risk = detail.risk_level || detail.riskLevel || 'Medium';
  const onTime = detail.on_time_delivery_rate || detail.onTimeDeliveryRate || 0;
  const location = detail.location || '';
  const cert = detail.certification || '';

  const riskConfig = {
    High: { color: 'red', label: 'High Risk', desc: 'Severe supply disruption risk' },
    Medium: { color: 'amber', label: 'Medium Risk', desc: 'Regular delivery tracking required' },
    Low: { color: 'green', label: 'Low Risk', desc: 'Stable and reliable supply' },
  };
  const rc = riskConfig[risk] || riskConfig.Medium;

  return (
    <div className="space-y-4">
      <DataCard>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl bg-${rc.color}-500/10 border border-${rc.color}-500/20 flex items-center justify-center`}>
            <Shield className={`w-6 h-6 text-${rc.color}-400`} />
          </div>
          <div>
            <p className={`text-sm font-bold text-${rc.color}-300`}>{rc.label}</p>
            <p className="text-[10px] text-neutral-500">{rc.desc}</p>
          </div>
        </div>
      </DataCard>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">On-time Delivery</p>
        <ProgressBar value={onTime * 100} max={100} color={onTime > 0.8 ? 'bg-green-500' : onTime > 0.6 ? 'bg-amber-500' : 'bg-red-500'}
          label={`${(onTime * 100).toFixed(0)}%`} />
      </DataCard>

      <div className="space-y-2">
        <InfoRow icon={MapPin} label="Location" value={location} />
        <InfoRow icon={Shield} label="Certification" value={cert} color="text-green-400" />
      </div>
    </div>
  );
}

function FactoryOverview({ detail }) {
  const { t } = useTranslation();
  const status = detail.status || 'Running';
  const util = detail.capacity_utilization || detail.capacityUtilization || 0;
  const hc = detail.headcount || 0;
  const location = detail.location || '';

  const statusConfig = {
    Running: { color: 'green', label: 'Running' },
    Maintenance: { color: 'amber', label: 'Maintenance' },
    Shutdown: { color: 'red', label: 'Shutdown' },
  };
  const sc = statusConfig[status] || statusConfig.Running;

  return (
    <div className="space-y-4">
      <DataCard>
        <div className="flex items-center gap-2 mb-0.5">
          <div className={`w-2.5 h-2.5 rounded-full bg-${sc.color}-500`} />
          <p className="text-xs font-bold text-white">{sc.label}</p>
        </div>
        <p className="text-[10px] text-neutral-500">Production Status</p>
      </DataCard>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Capacity Utilization</p>
        <ProgressBar value={util * 100} max={100} color="bg-purple-500"
          label={`${(util * 100).toFixed(1)}%`} />
      </DataCard>

      <div className="space-y-2">
        <InfoRow icon={Users} label="Headcount" value={`${hc}`} />
        <InfoRow icon={MapPin} label="Location" value={location} />
      </div>
    </div>
  );
}

// ---- PetFoodProduct Overview (v2) ----

const _ALLERGEN_KEYWORDS = new Set(['chicken', 'chicken meal', 'beef', 'salmon', 'wheat', 'corn', 'soy', 'dairy', 'egg']);
const _RISK_TAG_KEYWORDS = new Set(['chicken', 'chicken meal', 'taurine', 'phosphorus']);

function PetFoodProductOverview({ detail }) {
  const { t } = useTranslation();
  const props = detail.properties || {};
  const outgoing = detail.outgoing_links || [];

  const ingredientLinks = outgoing
    .filter(l => l.linkType === 'CONTAINS')
    .sort((a, b) => (a.ingredient_order ?? 999) - (b.ingredient_order ?? 999));
  const riskLinks = outgoing.filter(l => l.linkType === 'TRIGGERS_RISK');
  const brandLink = outgoing.find(l => l.linkType === 'MADE_BY');
  const speciesLink = outgoing.find(l => l.linkType === 'TARGETS_SPECIES');
  const stageLink = outgoing.find(l => l.linkType === 'SUITABLE_FOR');

  const species = props.target_species || 'unknown';
  const speciesLabel = { cat: t('entity.speciesCat'), dog: t('entity.speciesDog'), cat_or_dog: t('entity.speciesCatDog'), unknown: t('entity.speciesUnknown') }[species] || species;
  const stage = props.life_stage || 'unknown';
  const stageLabel = { kitten: t('entity.stageKitten'), puppy: t('entity.stagePuppy'), adult: t('entity.stageAdult'), senior: t('entity.stageSenior'), all_life_stages: t('entity.stageAllStages'), unknown: t('entity.speciesUnknown') }[stage] || stage;
  const categoryLabel = { dry_food: t('entity.categoryDryFood'), wet_food: t('entity.categoryWetFood'), treat: t('entity.categoryTreat'), supplement: t('entity.categorySupplement'), unknown: t('entity.speciesUnknown') }[props.category] || props.category;

  // Overall risk level
  const sevRank = { critical: 3, high: 3, medium: 2, low: 1 };
  const maxSev = riskLinks.reduce((m, l) => Math.max(m, sevRank[l.severity] || 0), 0);
  const riskLevel = maxSev >= 3 ? 'High' : maxSev >= 2 ? 'Medium' : 'Low';
  const riskColor = { High: 'red', Medium: 'amber', Low: 'green' }[riskLevel];
  const riskLabel = { High: t('entity.highRisk'), Medium: t('entity.mediumRisk'), Low: t('entity.noRisk') }[riskLevel];

  return (
    <div className="space-y-4">
      {/* ── 1. Product Header ── */}
      <DataCard className="!p-0 overflow-hidden">
        <div className={`px-4 py-3 bg-${riskColor}-500/5 border-b border-${riskColor}-500/10`}>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-sm font-bold text-white leading-tight">{props.product_name || detail.name || '—'}</h3>
            <Badge label={riskLabel} color={riskColor} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {brandLink && (
              <span className="text-[10px] text-cyan-400 font-medium">{brandLink.targetLabel}</span>
            )}
            <span className="text-[10px] text-neutral-600">|</span>
            <span className="text-[10px] text-neutral-400">{speciesLabel}</span>
            <span className="text-[10px] text-neutral-600">|</span>
            <span className="text-[10px] text-neutral-400">{stageLabel}</span>
            <span className="text-[10px] text-neutral-600">|</span>
            <span className="text-[10px] text-neutral-400">{categoryLabel}</span>
          </div>
        </div>
        <div className="px-4 py-2 flex items-center gap-3 text-[9px] text-neutral-600">
          {props.country && <span>{t('entity.origin')}: {props.country}</span>}
          {props.barcode && <span>{t('entity.barcode')}: {props.barcode}</span>}
          {props.product_id && <span className="font-mono">{props.product_id}</span>}
        </div>
      </DataCard>

      {/* ── 2. Nutrition Panel ── */}
      <NutritionPanel props={props} riskLinks={riskLinks} />

      {/* ── 3. Ingredient Panel ── */}
      {ingredientLinks.length > 0 && (
        <IngredientPanel ingredientLinks={ingredientLinks} />
      )}

      {/* ── 4. Risk Explanation Panel ── */}
      <RiskPanel riskLinks={riskLinks} />

      {/* ── 4.5 Rule Evaluation Summary ── */}
      <RuleEvaluationSection productId={props.product_id || detail.id} />

      {/* ── 5. Actions Panel ── */}
      <ProductActionsPanel detail={detail} riskLinks={riskLinks} />
    </div>
  );
}


/* ── Nutrition Panel ── */

function NutritionPanel({ props, riskLinks }) {
  const { t } = useTranslation();
  // Determine which fields are referenced by triggered rules
  const ruleFields = new Set();
  for (const r of riskLinks) {
    const ev = (r.evidence || '').toLowerCase();
    if (ev.includes('fat')) ruleFields.add('fat_100g');
    if (ev.includes('phosphorus')) ruleFields.add('phosphorus_100g');
    if (ev.includes('protein')) ruleFields.add('protein_100g');
  }

  const rows = [
    { key: 'protein_100g', label: t('entity.nutrientProtein'), unit: 'g', color: 'bg-blue-500', ref: 30, highGood: true },
    { key: 'fat_100g', label: t('entity.nutrientFat'), unit: 'g', color: 'bg-amber-500', ref: 20 },
    { key: 'fiber_100g', label: t('entity.nutrientFiber'), unit: 'g', color: 'bg-green-500', ref: 5 },
    { key: 'moisture_100g', label: t('entity.nutrientMoisture'), unit: 'g', color: 'bg-cyan-500', ref: 80 },
    { key: 'ash_100g', label: t('entity.nutrientAsh'), unit: 'g', color: 'bg-neutral-500', ref: 10 },
    { key: 'phosphorus_100g', label: t('entity.nutrientPhosphorus'), unit: 'g', color: 'bg-purple-500', ref: 0.8 },
    { key: 'calcium_100g', label: t('entity.nutrientCalcium'), unit: 'g', color: 'bg-pink-500', ref: 1.5 },
  ];

  return (
    <DataCard>
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.nutritionPanel')}</p>
      <div className="space-y-1.5">
        {rows.map(r => {
          const val = props[r.key];
          if (val == null) return null;
          const flagged = ruleFields.has(r.key);
          const pct = r.ref > 0 ? Math.min((val / r.ref) * 100, 100) : 0;
          return (
            <div key={r.key} className={`flex items-center gap-2 py-1 px-2 rounded-lg ${flagged ? 'bg-red-500/5 border border-red-500/10' : ''}`}>
              <span className={`text-[10px] w-14 shrink-0 ${flagged ? 'text-red-300 font-semibold' : 'text-neutral-500'}`}>
                {r.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${flagged ? 'bg-red-500' : r.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono w-12 text-right ${flagged ? 'text-red-400 font-bold' : 'text-neutral-300'}`}>
                {val}{r.unit}
              </span>
              {flagged && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
            </div>
          );
        })}
      </div>
    </DataCard>
  );
}


/* ── Ingredient Panel ── */

function IngredientPanel({ ingredientLinks }) {
  const { t } = useTranslation();
  return (
    <DataCard>
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {t('entity.ingredientCount')} ({ingredientLinks.length})
      </p>
      <div className="space-y-1">
        {ingredientLinks.map((l, i) => {
          const name = (l.targetLabel || '').toLowerCase();
          const isAllergen = _ALLERGEN_KEYWORDS.has(name);
          const isRiskTag = _RISK_TAG_KEYWORDS.has(name);
          return (
            <div
              key={i}
              className={`flex items-center gap-2 text-[10px] py-1.5 px-2 rounded-lg ${
                isAllergen ? 'bg-red-500/5 border border-red-500/10' : isRiskTag ? 'bg-amber-500/5 border border-amber-500/10' : ''
              }`}
            >
              <span className="text-neutral-600 w-4 text-right shrink-0">{i + 1}</span>
              <span className={`truncate flex-1 ${isAllergen ? 'text-red-300 font-semibold' : isRiskTag ? 'text-amber-300' : 'text-neutral-300'}`}>
                {l.targetLabel}
              </span>
              {isAllergen && (
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 shrink-0">
                  {t('entity.allergen')}
                </span>
              )}
              {isRiskTag && !isAllergen && (
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">
                  {t('entity.watch')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </DataCard>
  );
}


/* ── Risk Explanation Panel ── */

function RiskPanel({ riskLinks }) {
  const { t } = useTranslation();
  if (riskLinks.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
        <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
        <p className="text-xs text-green-300">{t('entity.noRiskTriggered')}</p>
      </div>
    );
  }

  return (
    <DataCard>
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {t('entity.riskExplanation')} ({riskLinks.length})
      </p>
      <div className="space-y-3">
        {riskLinks.map((l, i) => {
          const sev = l.severity || 'medium';
          const sevColor = { critical: 'red', high: 'red', medium: 'amber', low: 'green' }[sev] || 'amber';
          return (
            <div key={i} className={`p-3 rounded-lg border ${SEVERITY_BORDER[sev] || 'border-neutral-700'} bg-neutral-900/40`}>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] font-bold text-white">{l.targetLabel}</span>
                <Badge label={sev} color={sevColor} />
              </div>
              {l.evidence && (
                <div className="mb-1.5">
                  <span className="text-[9px] text-neutral-600 uppercase tracking-wider">{t('entity.evidence')}</span>
                  <p className="text-[11px] text-cyan-300 font-mono bg-cyan-500/5 border border-cyan-500/10 rounded px-2 py-1 mt-0.5">
                    {l.evidence}
                  </p>
                </div>
              )}
              {l.reason && (
                <div>
                  <span className="text-[9px] text-neutral-600 uppercase tracking-wider">{t('entity.reason')}</span>
                  <p className="text-[11px] text-neutral-300 mt-0.5 leading-relaxed">
                    {l.reason}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DataCard>
  );
}


/* ── Product Actions Panel ── */

/* ── Rule Evaluation Section (Phase 20) ── */

function RuleEvaluationSection({ productId }) {
  const { t } = useTranslation();
  const [evaluations, setEvaluations] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    fetch(`/api/pet-food/products/${productId}/rule-evaluations`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEvaluations(d.evaluations); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading || !evaluations) return null;

  const passed = evaluations.filter(e => e.status === 'passed');
  const notEvaluable = evaluations.filter(e => e.status === 'not_evaluable');
  const notApplicable = evaluations.filter(e => e.status === 'not_applicable');
  const triggered = evaluations.filter(e => e.status === 'triggered');

  return (
    <DataCard>
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {t('entity.ruleEvaluation')}
      </p>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <p className="text-lg font-bold text-red-400">{triggered.length}</p>
          <p className="text-[9px] text-neutral-600">{t('entity.triggered')}</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-green-400">{passed.length}</p>
          <p className="text-[9px] text-neutral-600">{t('entity.passed')}</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-amber-400">{notEvaluable.length}</p>
          <p className="text-[9px] text-neutral-600">{t('entity.notEvaluable')}</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-neutral-500">{notApplicable.length}</p>
          <p className="text-[9px] text-neutral-600">{t('entity.notApplicable')}</p>
        </div>
      </div>

      {notEvaluable.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-amber-400 font-medium">{t('entity.insufficientData')}</p>
          {notEvaluable.map((e, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1.5 bg-amber-500/5 border border-amber-500/10 rounded-lg">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-medium text-amber-300">{e.rule_id}</span>
                <p className="text-[9px] text-amber-400/80">{e.evidence}</p>
                {e.missing_fields?.length > 0 && (
                  <p className="text-[9px] text-neutral-500">{t('entity.missingFields')}: {e.missing_fields.join(', ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {notEvaluable.length === 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-green-500/5 border border-green-500/10 rounded-lg">
          <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
          <p className="text-[10px] text-green-300">{t('entity.allRulesEvaluated')}</p>
        </div>
      )}
    </DataCard>
  );
}

const _PRODUCT_ACTIONS = [
  { id: 'explain', labelKey: 'entity.actionExplainRisk', descKey: 'entity.actionExplainRiskDesc', icon: Shield, iconColor: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', needsRisk: true },
  { id: 'recommend', labelKey: 'entity.actionRecommend', descKey: 'entity.actionRecommendDesc', icon: Package, iconColor: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', needsRisk: false },
  { id: 'watchlist', labelKey: 'entity.actionWatchlist', descKey: 'entity.actionWatchlistDesc', icon: AlertTriangle, iconColor: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', needsRisk: true },
  { id: 'report', labelKey: 'entity.actionReport', descKey: 'entity.actionReportDesc', icon: FlaskConical, iconColor: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', needsRisk: false },
  { id: 'compare', labelKey: 'entity.actionCompare', descKey: 'entity.actionCompareDesc', icon: ArrowRight, iconColor: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', needsRisk: false },
];

function ProductActionsPanel({ detail, riskLinks }) {
  const { t } = useTranslation();
  const hasRisks = riskLinks.length > 0;

  return (
    <DataCard>
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.productActions')}</p>
      <div className="space-y-1.5">
        {_PRODUCT_ACTIONS.map(a => {
          const enabled = !a.needsRisk || hasRisks;
          return (
            <button
              key={a.id}
              disabled={!enabled}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                enabled
                  ? `${a.bg} ${a.border} hover:brightness-110 cursor-pointer`
                  : 'bg-neutral-900/30 border-neutral-800 text-neutral-600 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <a.icon className={`w-3.5 h-3.5 ${enabled ? a.iconColor : 'text-neutral-700'}`} />
                <span className={`text-[11px] font-semibold ${enabled ? 'text-white' : 'text-neutral-600'}`}>
                  {t(a.labelKey)}
                </span>
                {!enabled && <span className="text-[8px] text-neutral-700 ml-auto">{t('entity.requiresRisk')}</span>}
              </div>
              <p className={`text-[9px] ml-5.5 ${enabled ? 'text-neutral-500' : 'text-neutral-700'}`}>
                {t(a.descKey)}
              </p>
            </button>
          );
        })}
      </div>
    </DataCard>
  );
}

// ---- Brand Overview ----

function BrandOverview({ detail }) {
  const { t } = useTranslation();
  const props = detail.properties || {};
  const incoming = detail.incoming_links || [];

  const productLinks = incoming.filter(l => l.linkType === 'MADE_BY');

  return (
    <div className="space-y-4">
      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.brandInfo')}</p>
        <div className="space-y-1.5">
          <InfoRow label={t('entity.brandId')} value={props.brand_id || '—'} />
          <InfoRow label={t('entity.brandName')} value={props.brand_name || '—'} />
          <InfoRow label={t('entity.country')} value={props.country || '—'} />
        </div>
      </DataCard>

      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">{t('entity.products')}</p>
          <p className="text-xl font-bold text-cyan-400">{productLinks.length}</p>
          <p className="text-[10px] text-neutral-600">{t('entity.items')}</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">{t('entity.linksLabel')}</p>
          <p className="text-xl font-bold text-white">{incoming.length}</p>
          <p className="text-[10px] text-neutral-600">{t('entity.items')}</p>
        </DataCard>
      </div>

      {productLinks.length > 0 && (
        <DataCard>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.products')} ({productLinks.length})
          </p>
          <div className="space-y-1">
            {productLinks.slice(0, 10).map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] py-1">
                <Package className="w-3 h-3 text-pink-400 shrink-0" />
                <span className="text-neutral-300 truncate flex-1">{l.sourceLabel}</span>
                <span className="text-neutral-600 font-mono">{l.sourceId}</span>
              </div>
            ))}
            {productLinks.length > 10 && (
              <p className="text-[9px] text-neutral-600 mt-1">+ {productLinks.length - 10} more...</p>
            )}
          </div>
        </DataCard>
      )}

      {productLinks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg">
          <Info className="w-4 h-4 text-neutral-500 shrink-0" />
          <p className="text-xs text-neutral-500">{t('entity.noLinkedProducts')}</p>
        </div>
      )}
    </div>
  );
}

// ---- Ingredient Overview ----

function IngredientOverview({ detail }) {
  const { t } = useTranslation();
  const props = detail.properties || {};
  const incoming = detail.incoming_links || [];

  const productLinks = incoming.filter(l => l.linkType === 'CONTAINS');
  const isAllergen = props.common_allergen === true || props.common_allergen === 'true';

  return (
    <div className="space-y-4">
      {isAllergen && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-300">{t('entity.commonAllergen')}</p>
            <p className="text-[10px] text-red-400/80">{t('entity.commonAllergenDesc')}</p>
          </div>
        </div>
      )}

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.ingredientInfo')}</p>
        <div className="space-y-1.5">
          <InfoRow label={t('entity.ingredientId')} value={props.ingredient_id || '—'} />
          <InfoRow label={t('entity.ingredientName')} value={props.ingredient_name || '—'} />
          <InfoRow label={t('entity.ingredientType')} value={props.ingredient_type || '—'} />
          <InfoRow label={t('entity.riskTag')} value={props.risk_tag || t('entity.none')} color={props.risk_tag ? 'text-amber-400' : 'text-neutral-500'} />
          <InfoRow label={t('entity.commonAllergen')} value={isAllergen ? t('entity.yes') : t('entity.no')} color={isAllergen ? 'text-red-400' : 'text-green-400'} />
        </div>
      </DataCard>

      <DataCard>
        <p className="text-[10px] text-neutral-500 mb-0.5">{t('entity.productsContaining')}</p>
        <p className="text-xl font-bold text-green-400">{productLinks.length}</p>
        <p className="text-[10px] text-neutral-600">{t('entity.items')}</p>
      </DataCard>

      {productLinks.length > 0 && (
        <DataCard>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.productsWithIngredient')} ({productLinks.length})
          </p>
          <div className="space-y-1">
            {productLinks.slice(0, 10).map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] py-1">
                <Package className="w-3 h-3 text-pink-400 shrink-0" />
                <span className="text-neutral-300 truncate flex-1">{l.sourceLabel}</span>
                <span className="text-neutral-600 font-mono">{l.sourceId}</span>
              </div>
            ))}
            {productLinks.length > 10 && (
              <p className="text-[9px] text-neutral-600 mt-1">+ {productLinks.length - 10} more...</p>
            )}
          </div>
        </DataCard>
      )}
    </div>
  );
}

// ---- RiskRule Overview ----

function RiskRuleOverview({ detail }) {
  const { t } = useTranslation();
  const props = detail.properties || {};
  const incoming = detail.incoming_links || [];

  const triggeredLinks = incoming.filter(l => l.linkType === 'TRIGGERS_RISK');
  const severity = props.severity || 'medium';
  const sevColor = { critical: 'red', high: 'red', medium: 'amber', low: 'green' }[severity] || 'amber';

  return (
    <div className="space-y-4">
      <DataCard>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white">{props.rule_name || '—'}</span>
          <Badge label={severity} color={sevColor} />
        </div>
        <p className="text-[10px] text-neutral-400 leading-relaxed">{props.explanation || 'No description'}</p>
      </DataCard>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.ruleDetails')}</p>
        <div className="space-y-1.5">
          <InfoRow label={t('entity.ruleId')} value={props.rule_id || '—'} />
          <InfoRow label={t('entity.ruleName')} value={props.rule_name || '—'} />
          <InfoRow label={t('entity.severity')} value={severity} color={`text-${sevColor}-400`} />
        </div>
      </DataCard>

      <DataCard>
        <p className="text-[10px] text-neutral-500 mb-0.5">{t('entity.productsTriggering')}</p>
        <p className="text-xl font-bold text-red-400">{triggeredLinks.length}</p>
        <p className="text-[10px] text-neutral-600">{t('entity.items')}</p>
      </DataCard>

      {triggeredLinks.length > 0 && (
        <DataCard>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.triggeredProducts')} ({triggeredLinks.length})
          </p>
          <div className="space-y-2">
            {triggeredLinks.slice(0, 10).map((l, i) => (
              <div key={i} className="p-2 rounded-lg border border-neutral-800 bg-neutral-900/40">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-3 h-3 text-pink-400 shrink-0" />
                  <span className="text-[10px] font-medium text-neutral-300 truncate">{l.sourceLabel}</span>
                  <span className="text-[9px] text-neutral-600 font-mono ml-auto">{l.sourceId}</span>
                </div>
                {l.evidence && (
                  <p className="text-[9px] text-neutral-500 ml-5">{t('entity.evidence')}: {l.evidence}</p>
                )}
                {l.reason && (
                  <p className="text-[9px] text-neutral-500 ml-5 mt-0.5">{t('entity.reason')}: {l.reason}</p>
                )}
              </div>
            ))}
            {triggeredLinks.length > 10 && (
              <p className="text-[9px] text-neutral-600 mt-1">+ {triggeredLinks.length - 10} more...</p>
            )}
          </div>
        </DataCard>
      )}

      {triggeredLinks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-xs text-green-300">{t('entity.noProductsTrigger')}</p>
        </div>
      )}
    </div>
  );
}

const SEVERITY_BORDER = {
  critical: 'border-red-500/30',
  high: 'border-red-500/20',
  medium: 'border-amber-500/20',
  low: 'border-green-500/20',
};

// ---- Species Overview ----

function SpeciesOverview({ detail }) {
  const { t } = useTranslation();
  const props = detail.properties || {};
  const incoming = detail.incoming_links || [];

  const productLinks = incoming.filter(l => l.linkType === 'TARGETS_SPECIES');

  return (
    <div className="space-y-4">
      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.speciesInfo')}</p>
        <div className="space-y-1.5">
          <InfoRow label={t('entity.speciesId')} value={props.species_id || '—'} />
          <InfoRow label={t('entity.speciesName')} value={props.species_name || '—'} />
        </div>
      </DataCard>

      <DataCard>
        <p className="text-[10px] text-neutral-500 mb-0.5">{t('entity.productsForSpecies')}</p>
        <p className="text-xl font-bold text-blue-400">{productLinks.length}</p>
        <p className="text-[10px] text-neutral-600">{t('entity.items')}</p>
      </DataCard>

      {productLinks.length > 0 && (
        <DataCard>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.products')} ({productLinks.length})
          </p>
          <div className="space-y-1">
            {productLinks.slice(0, 10).map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] py-1">
                <Package className="w-3 h-3 text-pink-400 shrink-0" />
                <span className="text-neutral-300 truncate flex-1">{l.sourceLabel}</span>
                <span className="text-neutral-600 font-mono">{l.sourceId}</span>
              </div>
            ))}
            {productLinks.length > 10 && (
              <p className="text-[9px] text-neutral-600 mt-1">+ {productLinks.length - 10} more...</p>
            )}
          </div>
        </DataCard>
      )}

      {productLinks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg">
          <Info className="w-4 h-4 text-neutral-500 shrink-0" />
          <p className="text-xs text-neutral-500">{t('entity.noLinkedProducts')}</p>
        </div>
      )}
    </div>
  );
}

// ---- LifeStage Overview ----

function LifeStageOverview({ detail }) {
  const { t } = useTranslation();
  const props = detail.properties || {};
  const incoming = detail.incoming_links || [];

  const productLinks = incoming.filter(l => l.linkType === 'SUITABLE_FOR');

  return (
    <div className="space-y-4">
      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{t('entity.lifeStageInfo')}</p>
        <div className="space-y-1.5">
          <InfoRow label={t('entity.stageId')} value={props.stage_id || '—'} />
          <InfoRow label={t('entity.stageName')} value={props.stage_name || '—'} />
        </div>
      </DataCard>

      <DataCard>
        <p className="text-[10px] text-neutral-500 mb-0.5">{t('entity.productsForStage')}</p>
        <p className="text-xl font-bold text-purple-400">{productLinks.length}</p>
        <p className="text-[10px] text-neutral-600">{t('entity.items')}</p>
      </DataCard>

      {productLinks.length > 0 && (
        <DataCard>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.products')} ({productLinks.length})
          </p>
          <div className="space-y-1">
            {productLinks.slice(0, 10).map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] py-1">
                <Package className="w-3 h-3 text-pink-400 shrink-0" />
                <span className="text-neutral-300 truncate flex-1">{l.sourceLabel}</span>
                <span className="text-neutral-600 font-mono">{l.sourceId}</span>
              </div>
            ))}
            {productLinks.length > 10 && (
              <p className="text-[9px] text-neutral-600 mt-1">+ {productLinks.length - 10} more...</p>
            )}
          </div>
        </DataCard>
      )}

      {productLinks.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/50 border border-neutral-700 rounded-lg">
          <Info className="w-4 h-4 text-neutral-500 shrink-0" />
          <p className="text-xs text-neutral-500">{t('entity.noLinkedProducts')}</p>
        </div>
      )}
    </div>
  );
}

function NutritionRow({ label, value, color = 'text-neutral-400', threshold }) {
  const isWarning = threshold != null && value != null && value > threshold;
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-mono ${isWarning ? 'text-red-400 font-bold' : color}`}>
        {value != null ? value : '—'}
        {isWarning && <span className="text-[8px] ml-0.5">!</span>}
      </span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, color = 'text-neutral-500' }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-neutral-500 flex items-center gap-1.5">
        {Icon && <Icon className={`w-3 h-3 ${color}`} />}
        {label}
      </span>
      <span className="text-xs font-medium text-neutral-200">{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Links tab
// ══════════════════════════════════════════════════════

function LinksTab({ incoming, outgoing, onNavigate }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.upstream')} ({incoming.length})
          </p>
          <div className="space-y-1">
            {incoming.map((l, i) => (
              <LinkItem key={`in-${i}`} link={l} direction="in" onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {t('entity.downstream')} ({outgoing.length})
          </p>
          <div className="space-y-1">
            {outgoing.map((l, i) => (
              <LinkItem key={`out-${i}`} link={l} direction="out" onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {incoming.length === 0 && outgoing.length === 0 && (
        <p className="text-xs text-neutral-600 text-center py-8">{t('entity.noLinkedRelationships')}</p>
      )}
    </div>
  );
}

function LinkItem({ link, direction, onNavigate }) {
  const { t } = useTranslation();
  const targetId = direction === 'out' ? link.targetId : link.sourceId;
  const targetLabel = direction === 'out' ? link.targetLabel : link.sourceLabel;
  const targetType = direction === 'out' ? link.targetType : link.sourceType;

  const typeBadge = {
    supplies: 'supplies', used_in: 'used_in', assembled_into: 'assembles',
    manufactured_at: 'made_at',
    MADE_BY: 'MADE_BY', CONTAINS: 'CONTAINS', TARGETS_SPECIES: 'TARGETS_SPECIES',
    SUITABLE_FOR: 'SUITABLE_FOR', TRIGGERS_RISK: 'TRIGGERS_RISK', SIMILAR_TO: 'SIMILAR_TO',
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/50 group transition-colors">
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono shrink-0">
        {typeBadge[link.linkType] || link.linkType || '—'}
      </span>
      {direction === 'in' && <ArrowRight className="w-3 h-3 text-neutral-600" />}
      <span className="text-xs text-neutral-300 truncate flex-1">{targetLabel}</span>
      {direction === 'out' && <ArrowRight className="w-3 h-3 text-neutral-600" />}
      {onNavigate && targetId && (
        <button
          onClick={() => onNavigate(targetId)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-neutral-700 rounded"
          title={t('entity.locateInGraph')}
        >
          <ExternalLink className="w-3 h-3 text-blue-400" />
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Actions tab
// ══════════════════════════════════════════════════════

function ActionsTab({ objType, nodeId, detail, onRunAgent }) {
  const { t } = useTranslation();
  const actions = getActionsForType(objType, detail, t);

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
        {t('entity.availableActions')} ({actions.filter(a => a.enabled).length}/{actions.length})
      </p>

      {actions.map((action, i) => (
        <button
          key={i}
          disabled={!action.enabled}
          onClick={() => {
            if (action.runAgent && onRunAgent) onRunAgent(nodeId);
          }}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
            action.enabled
              ? `${action.bg} ${action.border} hover:brightness-110 cursor-pointer`
              : 'bg-neutral-900/30 border-neutral-800 text-neutral-600 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <action.icon className={`w-4 h-4 ${action.enabled ? action.iconColor : 'text-neutral-700'}`} />
            <span className={`text-xs font-semibold ${action.enabled ? 'text-white' : 'text-neutral-600'}`}>
              {action.title}
            </span>
            {!action.enabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-600 ml-auto">
                {t('entity.locked')}
              </span>
            )}
          </div>
          <p className={`text-[10px] ${action.enabled ? 'text-neutral-400' : 'text-neutral-700'}`}>
            {action.description}
          </p>
        </button>
      ))}
    </div>
  );
}

function getActionsForType(objType, detail, t) {
  if (objType === 'PetFoodProduct') return getPetFoodActions(detail, t);

  if (objType === 'RawMaterial') {
    const stock = detail.stock || 0;
    const threshold = detail.threshold || 0;
    const isAlert = stock < threshold;
    return [
      {
        title: isAlert ? 'Emergency Purchase Order' : 'Stock sufficient — purchasing locked',
        description: isAlert
          ? `Stock ${stock} < threshold ${threshold} — trigger emergency replenishment and ERP writeback`
          : `Current stock ${stock} ≥ safety threshold ${threshold} — guardrail locked, no purchase needed`,
        icon: Zap, iconColor: 'text-amber-400',
        enabled: isAlert, runAgent: true,
        bg: 'bg-amber-500/10', border: 'border-amber-500/20',
      },
      {
        title: 'Supplier Switch Assessment',
        description: 'Evaluate backup suppliers if current one cannot meet delivery',
        icon: Truck, iconColor: 'text-blue-400',
        enabled: true, runAgent: false,
        bg: 'bg-blue-500/10', border: 'border-blue-500/20',
      },
      {
        title: 'Quality Trace Analysis',
        description: 'Trace QC records for this batch and downstream component quality',
        icon: Shield, iconColor: 'text-purple-400',
        enabled: detail.quality_score < 0.85, runAgent: false,
        bg: 'bg-purple-500/10', border: 'border-purple-500/20',
      },
    ];
  }

  if (objType === 'Supplier') {
    const risk = detail.risk_level || detail.riskLevel || 'Medium';
    return [
      {
        title: risk === 'High' ? 'Initiate Risk Review' : 'Periodic Supplier Review',
        description: risk === 'High'
          ? 'High-risk supplier — full review and switch evaluation required'
          : 'Supplier status is normal — periodic review sufficient',
        icon: Shield, iconColor: risk === 'High' ? 'text-red-400' : 'text-green-400',
        enabled: true, runAgent: risk === 'High',
        bg: risk === 'High' ? 'bg-red-500/10' : 'bg-green-500/10',
        border: risk === 'High' ? 'border-red-500/20' : 'border-green-500/20',
      },
      {
        title: 'Delivery Trend Analysis',
        description: 'Analyze 12-month delivery trend and seasonal patterns',
        icon: Calendar, iconColor: 'text-blue-400',
        enabled: true, runAgent: false,
        bg: 'bg-blue-500/10', border: 'border-blue-500/20',
      },
    ];
  }

  if (objType === 'FinalProduct') {
    const target = detail.target_yield || detail.targetYield || 0;
    const current = detail.current_yield || detail.currentYield || 0;
    const ratio = target > 0 ? current / target : 1;
    return [
      {
        title: ratio < 0.8 ? 'AI Capacity Bottleneck Analysis' : 'Target achieved — no analysis needed',
        description: ratio < 0.8
          ? `Achievement ${(ratio*100).toFixed(0)}% — launch supply chain trace for upstream shortage root cause`
          : `Achievement ${(ratio*100).toFixed(0)}% — healthy`,
        icon: Cpu, iconColor: ratio < 0.8 ? 'text-purple-400' : 'text-green-400',
        enabled: ratio < 0.8, runAgent: true,
        bg: ratio < 0.8 ? 'bg-purple-500/10' : 'bg-green-500/10',
        border: ratio < 0.8 ? 'border-purple-500/20' : 'border-green-500/20',
      },
      {
        title: 'View BOM',
        description: 'Expand full BOM tree to view all upstream components and raw materials',
        icon: Package, iconColor: 'text-green-400',
        enabled: true, runAgent: false,
        bg: 'bg-green-500/10', border: 'border-green-500/20',
      },
    ];
  }

  if (objType === 'Component') {
    const days = detail.days_remaining || detail.daysRemaining || 7;
    return [
      {
        title: days < 3 ? 'Emergency Replenishment' : 'Stock Normal',
        description: days < 3
          ? `Only ${days.toFixed(1)} days of supply — emergency replenish to 7-day safety stock`
          : `Stock sufficient for ${days.toFixed(1)} days — no action needed`,
        icon: Zap, iconColor: days < 3 ? 'text-red-400' : 'text-green-400',
        enabled: days < 3, runAgent: true,
        bg: days < 3 ? 'bg-red-500/10' : 'bg-green-500/10',
        border: days < 3 ? 'border-red-500/20' : 'border-green-500/20',
      },
    ];
  }

  return [
    {
      title: t('entity.viewDetails'),
      description: t('entity.noSpecialActions'),
      icon: Info, iconColor: 'text-neutral-400',
      enabled: true, runAgent: false,
      bg: 'bg-neutral-800/50', border: 'border-neutral-700',
    },
  ];
}

function getPetFoodActions(detail, t) {
  const outgoing = detail.outgoing_links || [];
  const riskCount = outgoing.filter(l => l.linkType === 'TRIGGERS_RISK').length;
  const hasRisks = riskCount > 0;

  return [
    {
      title: t('entity.actionExplainRisk'),
      description: hasRisks
        ? `${t('entity.triggered')} ${riskCount} ${t('entity.ruleEvaluation').toLowerCase()}`
        : t('entity.noRiskTriggered'),
      icon: Shield, iconColor: hasRisks ? 'text-red-400' : 'text-green-400',
      enabled: true, runAgent: true,
      bg: hasRisks ? 'bg-red-500/10' : 'bg-green-500/10',
      border: hasRisks ? 'border-red-500/20' : 'border-green-500/20',
    },
    {
      title: t('entity.actionRecommend'),
      description: t('entity.actionRecommendDesc'),
      icon: Package, iconColor: 'text-blue-400',
      enabled: true, runAgent: false,
      bg: 'bg-blue-500/10', border: 'border-blue-500/20',
    },
    {
      title: t('entity.actionWatchlist'),
      description: t('entity.actionWatchlistDesc'),
      icon: AlertTriangle, iconColor: 'text-amber-400',
      enabled: hasRisks, runAgent: false,
      bg: 'bg-amber-500/10', border: 'border-amber-500/20',
    },
    {
      title: t('entity.actionReport'),
      description: t('entity.actionReportDesc'),
      icon: FlaskConical, iconColor: 'text-purple-400',
      enabled: true, runAgent: false,
      bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    },
  ];
}

// ══════════════════════════════════════════════════════
// Impact analysis tab
// ══════════════════════════════════════════════════════

function BlastRadiusTab({ nodeId, onNavigate }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [depth, setDepth] = useState(3);

  useEffect(() => {
    setLoading(true);
    import('../api').then(({ fetchImpactAnalysis }) =>
      fetchImpactAnalysis(nodeId, depth)
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false))
    );
  }, [nodeId, depth]);

  if (loading) return <p className="text-xs text-neutral-500 text-center py-8">{t('entity.analyzing')}</p>;
  if (!data || data.error) return <p className="text-xs text-neutral-600 text-center py-8">{data?.error || t('entity.impactError')}</p>;

  const affected = Object.entries(data.affected_nodes || {})
    .filter(([id]) => id !== nodeId)
    .sort((a, b) => a[1].depth - b[1].depth);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
          {t('entity.affectedNodes')} ({data.total_affected || affected.length})
        </p>
        <select value={depth} onChange={e => setDepth(Number(e.target.value))}
          className="text-[10px] bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-400">
          {[1,2,3,4].map(d => <option key={d} value={d}>{t('entity.depth')} {d}</option>)}
        </select>
      </div>

      <DataCard>
        <p className="text-[10px] text-neutral-500 mb-1">{t('entity.sourceNode')}</p>
        <p className="text-xs font-medium text-white">{data.source_label || nodeId}</p>
      </DataCard>

      {affected.length === 0 ? (
        <p className="text-xs text-neutral-600 text-center py-4">{t('entity.noDownstream')}</p>
      ) : (
        <div className="space-y-1">
          {affected.map(([id, info]) => (
            <button
              key={id}
              onClick={() => onNavigate?.(id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-800/50 transition-colors text-left"
            >
              <span className="text-[10px] text-neutral-600 w-5 text-right">L{info.depth}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${info.alert ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`} />
              <span className="text-xs text-neutral-300 truncate flex-1">{info.label}</span>
              <span className="text-[10px] text-neutral-600">{info.object_type}</span>
              <ExternalLink className="w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TypeIcon({ type }) {
  const cls = 'w-4 h-4';
  switch (type) {
    case 'RawMaterial': return <FlaskConical className={`${cls} text-amber-500`} />;
    case 'Component': return <Cpu className={`${cls} text-blue-500`} />;
    case 'FinalProduct': return <Package className={`${cls} text-green-500`} />;
    case 'Supplier': return <Truck className={`${cls} text-red-500`} />;
    case 'Factory': return <Factory className={`${cls} text-purple-500`} />;
    case 'PetFoodProduct': return <Package className={`${cls} text-pink-500`} />;
    case 'Brand': return <Package className={`${cls} text-cyan-500`} />;
    case 'Ingredient': return <FlaskConical className={`${cls} text-green-500`} />;
    case 'RiskRule': return <Shield className={`${cls} text-amber-500`} />;
    case 'Species': return <Users className={`${cls} text-blue-500`} />;
    case 'LifeStage': return <Calendar className={`${cls} text-purple-500`} />;
    default: return <Activity className={`${cls} text-neutral-500`} />;
  }
}
