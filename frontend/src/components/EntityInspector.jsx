import { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle, Package, Truck, Factory, Cpu,
  FlaskConical, Shield, MapPin, Calendar, Users, Activity,
  ChevronDown, ChevronUp, ExternalLink, Info, Link2, Zap, ArrowRight,
} from 'lucide-react';

// ══════════════════════════════════════════════════════
// 小型工具组件
// ══════════════════════════════════════════════════════

function ProgressBar({ value, max, color = 'bg-blue-500', label }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const danger = pct < 30;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>{label || `${pct.toFixed(1)}%`}</span>
        {danger && <span className="text-red-400 font-medium">低水位</span>}
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
// 主组件
// ══════════════════════════════════════════════════════

export default function EntityInspector({
  selectedNode, nodeDetail, refreshGraph, refreshDetail,
  onNavigateToNode, onRunAgent,
}) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!selectedNode || !nodeDetail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-700 gap-3 px-4">
        <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
          <Cpu className="w-6 h-6 opacity-25" />
        </div>
        <p className="text-xs text-center leading-relaxed">
          点击图谱中的节点
          <br />
          查看对象 360° 本体详情
        </p>
        <p className="text-[10px] text-neutral-700">Overview · Links · Actions</p>
      </div>
    );
  }

  const objType = nodeDetail.object_type || nodeDetail.objectType || '';
  const outgoing = nodeDetail.outgoing_links || [];
  const incoming = nodeDetail.incoming_links || [];

  // 动态标签/颜色：优先用已知中文名，否则直接用 Neo4j 标签
  const KNOWN_LABELS = { Supplier: '供应商', RawMaterial: '原材料', Component: '零部件', FinalProduct: '最终产品', Factory: '工厂', Plant: '工厂' };
  const KNOWN_COLORS = { Supplier: 'red', RawMaterial: 'amber', Component: 'blue', FinalProduct: 'green', Factory: 'purple', Plant: 'purple' };
  const typeLabel = { [objType]: KNOWN_LABELS[objType] || objType };
  const typeColor = { [objType]: KNOWN_COLORS[objType] || 'neutral' };

  const tabs = [
    { id: 'overview', label: '概览', icon: Info },
    { id: 'links', label: `链路 (${incoming.length + outgoing.length})`, icon: Link2 },
    { id: 'blast', label: '影响分析', icon: AlertTriangle },
    { id: 'actions', label: '动作', icon: Zap },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ---- 头部 ---- */}
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <TypeIcon type={objType} />
          <h2 className="text-sm font-semibold text-white truncate">{nodeDetail.label || selectedNode.id}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-600 font-mono">{selectedNode.id}</span>
          <Badge label={typeLabel[objType] || '未知'} color={typeColor[objType] || 'neutral'} />
          {nodeDetail.alert && <Badge label="告警" color="red" />}
        </div>
      </div>

      {/* ---- 标签栏 ---- */}
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

      {/* ---- 内容 ---- */}
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
// 概览标签页
// ══════════════════════════════════════════════════════

function OverviewTab({ objType, detail }) {
  if (objType === 'RawMaterial') return <RawMaterialOverview detail={detail} />;
  if (objType === 'Component') return <ComponentOverview detail={detail} />;
  if (objType === 'FinalProduct') return <FinalProductOverview detail={detail} />;
  if (objType === 'Supplier') return <SupplierOverview detail={detail} />;
  if (objType === 'Factory') return <FactoryOverview detail={detail} />;
  return <p className="text-xs text-neutral-500">未知对象类型</p>;
}

function RawMaterialOverview({ detail }) {
  const stock = detail.stock || 0;
  const threshold = detail.threshold || 0;
  const isAlert = stock < threshold;
  const quality = detail.quality_score || detail.qualityScore || 0;
  const unit = detail.unit || '吨';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">当前库存</p>
          <p className={`text-xl font-bold ${isAlert ? 'text-red-400' : 'text-white'}`}>{stock}</p>
          <p className="text-[10px] text-neutral-600">{unit}</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">安全阈值</p>
          <p className="text-xl font-bold text-white">{threshold}</p>
          <p className="text-[10px] text-neutral-600">{unit}</p>
        </DataCard>
      </div>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">库存水位</p>
        <ProgressBar value={stock} max={threshold * 1.5} color="bg-amber-500"
          label={`${stock} / ${threshold} ${unit}`} />
      </DataCard>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">质量指标</p>
        <ProgressBar value={quality * 100} max={100} color="bg-blue-500" label={`质检得分 ${(quality * 100).toFixed(0)}%`} />
      </DataCard>

      {isAlert && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-300">库存告警</p>
            <p className="text-[10px] text-red-400/80">缺口 {(threshold - stock).toFixed(1)} {unit}，建议立即发起采购</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentOverview({ detail }) {
  const stock = detail.stock || 0;
  const daily = detail.daily_consumption || detail.dailyConsumption || 0;
  const days = detail.days_remaining || detail.daysRemaining || (daily > 0 ? stock / daily : 0);
  const defect = detail.defect_rate || detail.defectRate || 0;
  const isAlert = days < 3;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">库存数量</p>
          <p className="text-xl font-bold text-white">{stock}</p>
          <p className="text-[10px] text-neutral-600">{detail.unit || '件'}</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">日消耗量</p>
          <p className="text-xl font-bold text-white">{daily}</p>
          <p className="text-[10px] text-neutral-600">件/天</p>
        </DataCard>
      </div>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">可支撑天数</p>
        <ProgressBar value={days} max={10} color={days < 3 ? 'bg-red-500' : 'bg-blue-500'}
          label={`${days.toFixed(1)} 天`} />
      </DataCard>

      <DataCard>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-neutral-500">不良率</span>
          <span className={`text-xs font-bold ${defect > 0.03 ? 'text-red-400' : 'text-green-400'}`}>
            {(defect * 100).toFixed(1)}%
          </span>
        </div>
      </DataCard>

      {isAlert && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-300">库存告急</p>
            <p className="text-[10px] text-red-400/80">仅剩 {days.toFixed(1)} 天用量</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FinalProductOverview({ detail }) {
  const target = detail.target_yield || detail.targetYield || 0;
  const current = detail.current_yield || detail.currentYield || 0;
  const ratio = detail.yield_ratio || detail.yieldRatio || (target > 0 ? current / target : 0);
  const isAlert = ratio < 0.8;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">目标产能</p>
          <p className="text-xl font-bold text-white">{target}</p>
          <p className="text-[10px] text-neutral-600">{detail.unit || '台'}/月</p>
        </DataCard>
        <DataCard>
          <p className="text-[10px] text-neutral-500 mb-0.5">实际产能</p>
          <p className={`text-xl font-bold ${isAlert ? 'text-red-400' : 'text-white'}`}>{current}</p>
          <p className="text-[10px] text-neutral-600">{detail.unit || '台'}/月</p>
        </DataCard>
      </div>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">产能达标率</p>
        <ProgressBar value={ratio * 100} max={100} color={isAlert ? 'bg-red-500' : 'bg-green-500'}
          label={`${(ratio * 100).toFixed(1)}%`} />
      </DataCard>

      {isAlert && (
        <DataCard>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-neutral-500">产能缺口</span>
            <span className="text-xs font-bold text-red-400">{target - current} {detail.unit || '台'}/月</span>
          </div>
        </DataCard>
      )}

      {!isAlert && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-xs text-green-300">产能达标，状态健康</p>
        </div>
      )}
    </div>
  );
}

function SupplierOverview({ detail }) {
  const risk = detail.risk_level || detail.riskLevel || 'Medium';
  const onTime = detail.on_time_delivery_rate || detail.onTimeDeliveryRate || 0;
  const location = detail.location || '';
  const cert = detail.certification || '';

  const riskConfig = {
    High: { color: 'red', label: '高风险', desc: '该供应商存在严重断供风险' },
    Medium: { color: 'amber', label: '中风险', desc: '需定期跟踪交付表现' },
    Low: { color: 'green', label: '低风险', desc: '供应稳定，可信任' },
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
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">交货准时率</p>
        <ProgressBar value={onTime * 100} max={100} color={onTime > 0.8 ? 'bg-green-500' : onTime > 0.6 ? 'bg-amber-500' : 'bg-red-500'}
          label={`${(onTime * 100).toFixed(0)}%`} />
      </DataCard>

      <div className="space-y-2">
        <InfoRow icon={MapPin} label="所在地" value={location} />
        <InfoRow icon={Shield} label="资质" value={cert} color="text-green-400" />
      </div>
    </div>
  );
}

function FactoryOverview({ detail }) {
  const status = detail.status || 'Running';
  const util = detail.capacity_utilization || detail.capacityUtilization || 0;
  const hc = detail.headcount || 0;
  const location = detail.location || '';

  const statusConfig = {
    Running: { color: 'green', label: '运行中' },
    Maintenance: { color: 'amber', label: '维护中' },
    Shutdown: { color: 'red', label: '已停工' },
  };
  const sc = statusConfig[status] || statusConfig.Running;

  return (
    <div className="space-y-4">
      <DataCard>
        <div className="flex items-center gap-2 mb-0.5">
          <div className={`w-2.5 h-2.5 rounded-full bg-${sc.color}-500`} />
          <p className="text-xs font-bold text-white">{sc.label}</p>
        </div>
        <p className="text-[10px] text-neutral-500">生产状态</p>
      </DataCard>

      <DataCard>
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">产能利用率</p>
        <ProgressBar value={util * 100} max={100} color="bg-purple-500"
          label={`${(util * 100).toFixed(1)}%`} />
      </DataCard>

      <div className="space-y-2">
        <InfoRow icon={Users} label="在岗人数" value={`${hc} 人`} />
        <InfoRow icon={MapPin} label="所在地" value={location} />
      </div>
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
// 链路标签页
// ══════════════════════════════════════════════════════

function LinksTab({ incoming, outgoing, onNavigate }) {
  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            上游依赖 ({incoming.length})
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
            下游流向 ({outgoing.length})
          </p>
          <div className="space-y-1">
            {outgoing.map((l, i) => (
              <LinkItem key={`out-${i}`} link={l} direction="out" onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {incoming.length === 0 && outgoing.length === 0 && (
        <p className="text-xs text-neutral-600 text-center py-8">暂无关联链路</p>
      )}
    </div>
  );
}

function LinkItem({ link, direction, onNavigate }) {
  const targetId = direction === 'out' ? link.targetId : link.sourceId;
  const targetLabel = direction === 'out' ? link.targetLabel : link.sourceLabel;
  const targetType = direction === 'out' ? link.targetType : link.sourceType;

  const typeBadge = {
    supplies: '供应', used_in: '用料', assembled_into: '装配',
    manufactured_at: '生产于',
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
          title="在图谱中定位"
        >
          <ExternalLink className="w-3 h-3 text-blue-400" />
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 动作标签页
// ══════════════════════════════════════════════════════

function ActionsTab({ objType, nodeId, detail, onRunAgent }) {
  const actions = getActionsForType(objType, detail);

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
        可用操作 ({actions.filter(a => a.enabled).length}/{actions.length})
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
                已锁定
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

function getActionsForType(objType, detail) {
  if (objType === 'RawMaterial') {
    const stock = detail.stock || 0;
    const threshold = detail.threshold || 0;
    const isAlert = stock < threshold;
    return [
      {
        title: isAlert ? '紧急下发采购单' : '库存充足，采购锁闭',
        description: isAlert
          ? `库存 ${stock} < 阈值 ${threshold}，触发紧急补货流程并执行 ERP 回写`
          : `当前库存 ${stock} ≥ 安全阈值 ${threshold}，护栏已锁——无需采购`,
        icon: Zap, iconColor: 'text-amber-400',
        enabled: isAlert, runAgent: true,
        bg: 'bg-amber-500/10', border: 'border-amber-500/20',
      },
      {
        title: '启动供应商切换评估',
        description: '若当前供应商无法满足交期，评估备用供应商方案',
        icon: Truck, iconColor: 'text-blue-400',
        enabled: true, runAgent: false,
        bg: 'bg-blue-500/10', border: 'border-blue-500/20',
      },
      {
        title: '质量追溯分析',
        description: '追溯该批次原材料的质检记录与下游零部件质量关联',
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
        title: risk === 'High' ? '发起风险审查流程' : '供应商定期评估',
        description: risk === 'High'
          ? '该供应商为高风险等级，需启动全面审查并评估切换方案'
          : '该供应商状态正常，可进行常规定期评估',
        icon: Shield, iconColor: risk === 'High' ? 'text-red-400' : 'text-green-400',
        enabled: true, runAgent: risk === 'High',
        bg: risk === 'High' ? 'bg-red-500/10' : 'bg-green-500/10',
        border: risk === 'High' ? 'border-red-500/20' : 'border-green-500/20',
      },
      {
        title: '交期趋势分析',
        description: '分析该供应商近 12 个月的交货准时率趋势与季节性波动',
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
        title: ratio < 0.8 ? 'AI 产能瓶颈分析' : '产能达标，无需分析',
        description: ratio < 0.8
          ? `达标率仅 ${(ratio*100).toFixed(0)}%，启动链路穿透引擎追溯上游缺料根因`
          : `达标率 ${(ratio*100).toFixed(0)}%，状态健康`,
        icon: Cpu, iconColor: ratio < 0.8 ? 'text-purple-400' : 'text-green-400',
        enabled: ratio < 0.8, runAgent: true,
        bg: ratio < 0.8 ? 'bg-purple-500/10' : 'bg-green-500/10',
        border: ratio < 0.8 ? 'border-purple-500/20' : 'border-green-500/20',
      },
      {
        title: 'BOM 物料清单查看',
        description: '展开该产品的完整 BOM 树，查看所有上游零部件和原材料构成',
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
        title: days < 3 ? '紧急补货' : '库存正常',
        description: days < 3
          ? `仅剩 ${days.toFixed(1)} 天用量，需紧急补货至 7 天安全库存`
          : `库存可支撑 ${days.toFixed(1)} 天，无需操作`,
        icon: Zap, iconColor: days < 3 ? 'text-red-400' : 'text-green-400',
        enabled: days < 3, runAgent: true,
        bg: days < 3 ? 'bg-red-500/10' : 'bg-green-500/10',
        border: days < 3 ? 'border-red-500/20' : 'border-green-500/20',
      },
    ];
  }

  return [
    {
      title: '查看详情',
      description: '该类型暂无特殊业务动作，可查看完整属性信息',
      icon: Info, iconColor: 'text-neutral-400',
      enabled: true, runAgent: false,
      bg: 'bg-neutral-800/50', border: 'border-neutral-700',
    },
  ];
}

// ══════════════════════════════════════════════════════
// 工具
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// 影响分析标签页
// ══════════════════════════════════════════════════════

function BlastRadiusTab({ nodeId, onNavigate }) {
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

  if (loading) return <p className="text-xs text-neutral-500 text-center py-8">分析中...</p>;
  if (!data || data.error) return <p className="text-xs text-neutral-600 text-center py-8">{data?.error || '无法加载影响分析'}</p>;

  const affected = Object.entries(data.affected_nodes || {})
    .filter(([id]) => id !== nodeId)
    .sort((a, b) => a[1].depth - b[1].depth);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
          受影响节点 ({data.total_affected || affected.length})
        </p>
        <select value={depth} onChange={e => setDepth(Number(e.target.value))}
          className="text-[10px] bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-400">
          {[1,2,3,4].map(d => <option key={d} value={d}>深度 {d}</option>)}
        </select>
      </div>

      <DataCard>
        <p className="text-[10px] text-neutral-500 mb-1">源节点</p>
        <p className="text-xs font-medium text-white">{data.source_label || nodeId}</p>
      </DataCard>

      {affected.length === 0 ? (
        <p className="text-xs text-neutral-600 text-center py-4">无下游受影响节点</p>
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
    default: return <Activity className={`${cls} text-neutral-500`} />;
  }
}
