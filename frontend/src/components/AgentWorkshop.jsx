import { useRef, useEffect } from 'react';
import { Check, X, Loader2, Brain, Wand2, ArrowLeft } from 'lucide-react';

const TYPE_CONFIG = {
  thought: { color: 'border-l-orange-500', bg: 'bg-orange-500/10', badgeBg: 'bg-orange-500/20', badgeText: 'text-orange-400', label: '🧠 思考' },
  tool_call: { color: 'border-l-blue-500', bg: 'bg-blue-500/10', badgeBg: 'bg-blue-500/20', badgeText: 'text-blue-400', label: '🔧 工具调用' },
  observation: { color: 'border-l-green-500', bg: 'bg-green-500/10', badgeBg: 'bg-green-500/20', badgeText: 'text-green-400', label: '👁️ 系统观察' },
  decision: { color: 'border-l-purple-500', bg: 'bg-purple-500/10', badgeBg: 'bg-purple-500/20', badgeText: 'text-purple-400', label: '🎯 决策' },
  result: { color: 'border-l-green-500', bg: 'bg-green-500/10', badgeBg: 'bg-green-500/20', badgeText: 'text-green-400', label: '✅ 结果' },
  error: { color: 'border-l-red-500', bg: 'bg-red-500/10', badgeBg: 'bg-red-500/20', badgeText: 'text-red-400', label: '❌ 错误' },
};

export default function AgentWorkshop({
  selectedNode,
  agentLogs,
  agentDecision,
  isAgentRunning,
  onApprove,
  onReject,
  onBack,
}) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentLogs, agentDecision]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
        <button onClick={onBack} className="p-1 hover:bg-neutral-800 rounded transition-colors text-neutral-500 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Brain className="w-4 h-4 text-orange-500" />
        <div>
          <h2 className="text-sm font-semibold text-white">智能体推理</h2>
          <p className="text-[10px] text-neutral-500">ReAct 闭环 · 上下文感知</p>
        </div>
      </div>

      {/* 目标节点 */}
      {selectedNode && (
        <div className="px-4 py-2 border-b border-neutral-800 bg-blue-500/5">
          <p className="text-[10px] text-neutral-500">分析目标</p>
          <p className="text-xs font-medium text-white truncate">
            {selectedNode.label || selectedNode.id}
            <span className="text-neutral-600 font-mono ml-1">{selectedNode.id}</span>
          </p>
        </div>
      )}

      {/* 日志流 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {agentLogs.length === 0 && isAgentRunning && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-xs">初始化推理引擎...</p>
          </div>
        )}

        {agentLogs.map((log, i) => {
          const config = TYPE_CONFIG[log.type] || TYPE_CONFIG.thought;
          return (
            <div
              key={i}
              className={`log-entry border-l-2 ${config.color} ${config.bg} rounded-r-lg pl-3 pr-3 py-2.5`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.badgeBg} ${config.badgeText} font-medium`}>
                  {config.label}
                </span>
                <span className="text-[10px] text-neutral-600">{log.timestamp}</span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
                {log.message}
              </p>
            </div>
          );
        })}

        {isAgentRunning && agentLogs.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-500">
            <Loader2 className="w-3 h-3 animate-spin" /> 推理进行中...
          </div>
        )}

        <div ref={logEndRef} />
      </div>

      {/* HITL 审批闸门 */}
      {agentDecision && !isAgentRunning && <HITLGate decision={agentDecision} onApprove={onApprove} onReject={onReject} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// HITL 审批面板
// ══════════════════════════════════════════════════════

function HITLGate({ decision, onApprove, onReject }) {
  const actionName = decision.action_name;
  const params = decision.params || {};

  const titleMap = {
    emergency_purchase_raw_material: '紧急采购单',
    create_purchase_order: '紧急采购单',
    supplier_risk_review: '供应商风险审查',
    restock_component: '零部件紧急补货',
  };

  const summaryMap = {
    emergency_purchase_raw_material: (
      <span>
        对 <b className="text-white">{params.material_name}</b> 发起采购
        · 补货 <b className="text-white">{params.quantity} {params.material_name ? '吨' : ''}</b>
        {params.current_stock != null && (
          <span className="text-neutral-500">（{params.current_stock} → {params.target_stock}）</span>
        )}
      </span>
    ),
    supplier_risk_review: (
      <span>
        对 <b className="text-white">{params.supplier_name}</b> 发起风险审查
        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded ${
          params.risk_level === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {params.risk_level === 'High' ? '高风险' : params.risk_level}
        </span>
      </span>
    ),
    restock_component: (
      <span>
        对 <b className="text-white">{params.component_name}</b> 发起补货
        · 目标 <b className="text-white">{params.target_stock} 件</b>
      </span>
    ),
  };

  return (
    <div className="px-4 py-4 border-t border-neutral-800 bg-neutral-900/70">
      <div className="flex items-center gap-2 mb-3">
        <Wand2 className="w-4 h-4 text-yellow-500" />
        <span className="text-xs font-semibold text-yellow-400">人工审批闸门 (HITL)</span>
        <span className="text-[10px] text-neutral-600 ml-auto">人机协同·决策闭环</span>
      </div>

      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mb-3">
        <p className="text-xs text-purple-300 font-medium mb-1">
          {titleMap[actionName] || '业务操作审批'}
        </p>
        <p className="text-xs text-neutral-300">
          {summaryMap[actionName] || <span>执行审批操作</span>}
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                     bg-green-600 hover:bg-green-500 text-white text-xs font-semibold
                     rounded-lg transition-colors">
          <Check className="w-3.5 h-3.5" /> 同意并执行
        </button>
        <button onClick={onReject}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                     bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-xs font-semibold
                     rounded-lg transition-colors">
          <X className="w-3.5 h-3.5" /> 驳回
        </button>
      </div>
    </div>
  );
}
