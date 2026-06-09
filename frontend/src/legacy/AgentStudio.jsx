import { Bot, MessageSquare, Shield, Workflow, Zap, ArrowRight, Lock } from 'lucide-react';

/**
 * AgentStudio — 智能体工作台（原型）
 * 展示 AI Agent 的 ReAct 推理、HITL 审批、多工具协同能力
 */
export default function AgentStudio() {
  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">智能体工作台</h2>
              <p className="text-[11px] text-neutral-500">Agent Studio · ReAct 推理 + HITL 审批 + 多工具协同</p>
            </div>
          </div>
          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
            <Lock className="w-3 h-3" /> 开发中
          </span>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左侧：对话区 */}
        <div className="flex-1 flex flex-col border-r border-neutral-800">
          {/* 对话历史 */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* 示例消息 1 */}
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-neutral-400">U</span>
              </div>
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl rounded-tl-sm px-4 py-3 max-w-md">
                <p className="text-xs text-neutral-300">分析供应商 CC母婴有限公司 的供应链风险，如果库存低于安全水位，建议补货方案。</p>
              </div>
            </div>

            {/* Agent 推理过程 */}
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="space-y-2 max-w-lg">
                {/* 思考 */}
                <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-violet-400 font-semibold mb-1">思考 (Thought)</p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    需要先查询该供应商的关联产品和库存状态，然后评估供应链风险...
                  </p>
                </div>
                {/* 工具调用 */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-blue-400 font-semibold mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> 工具调用 (Action)
                  </p>
                  <div className="bg-neutral-900 rounded-lg px-3 py-2 font-mono text-[10px] text-cyan-400">
                    query_neighbors(node_id="supplier_cc", depth=2)
                  </div>
                </div>
                {/* 观察 */}
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-green-400 font-semibold mb-1">观察 (Observation)</p>
                  <p className="text-xs text-neutral-400">发现 3 个关联产品，其中 2 个库存低于安全水位...</p>
                </div>
                {/* 决策 */}
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-amber-400 font-semibold mb-1">决策 (Decision)</p>
                  <p className="text-xs text-neutral-300">建议对 NCM811 正极材料发起紧急采购，数量 500kg。</p>
                  <div className="flex gap-2 mt-2">
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 border border-green-500/30 rounded-lg text-[10px] text-green-400 hover:bg-green-600/30 transition-colors">
                      <Shield className="w-3 h-3" /> 批准执行
                    </button>
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-red-600/10 border border-red-500/20 rounded-lg text-[10px] text-red-400 hover:bg-red-600/20 transition-colors">
                      驳回
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 输入栏 */}
          <div className="px-6 py-3 border-t border-neutral-800 shrink-0">
            <div className="flex gap-2">
              <input
                disabled
                placeholder="输入指令让 Agent 分析数据、执行操作..."
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 text-xs text-neutral-500 outline-none"
              />
              <button disabled className="px-4 py-2.5 bg-violet-600/30 rounded-lg text-xs text-violet-400/50 cursor-not-allowed">
                发送
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：工具面板 */}
        <div className="w-72 shrink-0 overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">可用工具</p>
          {[
            { icon: MessageSquare, name: '查询节点', desc: '查询节点属性和链路', color: 'cyan' },
            { icon: Workflow, name: '影响分析', desc: '分析爆炸半径和上下游', color: 'purple' },
            { icon: Zap, name: '执行动作', desc: '创建订单/触发采购/发送告警', color: 'amber' },
            { icon: Shield, name: 'HITL 审批', desc: '高风险操作需人工确认', color: 'green' },
          ].map((tool, i) => (
            <div key={i} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5 opacity-60">
              <div className="flex items-center gap-2 mb-1">
                <tool.icon className={`w-3.5 h-3.5 text-${tool.color}-400`} />
                <span className="text-xs font-medium text-neutral-300">{tool.name}</span>
              </div>
              <p className="text-[10px] text-neutral-500">{tool.desc}</p>
            </div>
          ))}

          <div className="mt-4 pt-3 border-t border-neutral-800">
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">推理链路</p>
            {['感知 → 接收用户意图', '推理 → 多步工具调用', '决策 → 输出建议方案', '执行 → 人工审批后操作'].map((step, i) => (
              <div key={i} className="flex items-center gap-2 py-1 opacity-50">
                <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[9px] text-neutral-500">{i + 1}</div>
                <span className="text-[10px] text-neutral-500">{step}</span>
                {i < 3 && <ArrowRight className="w-2.5 h-2.5 text-neutral-700 ml-auto" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
