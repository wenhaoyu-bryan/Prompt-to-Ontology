import { Brain, Cpu, Activity, GitMerge, Lock, ArrowRight, Layers, BarChart2, Network } from 'lucide-react';

/**
 * ReasoningView — 模型推理工作台（原型）
 * 展示 LLM 推理可视化、模型对比、链路推理能力
 */
export default function ReasoningView() {
  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">模型推理</h2>
              <p className="text-[11px] text-neutral-500">Reasoning Engine · LLM 推理可视化 + 模型对比 + 链路推理</p>
            </div>
          </div>
          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
            <Lock className="w-3 h-3" /> 开发中
          </span>
        </div>
      </div>

      {/* 主体：三列布局 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左列：推理任务面板 */}
        <div className="w-72 shrink-0 border-r border-neutral-800 overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">推理任务</p>
          {[
            { name: '语义链路推理', desc: '基于本体图谱的多跳推理', icon: GitMerge, status: 'ready' },
            { name: '爆炸半径分析', desc: '级联影响范围预测', icon: Network, status: 'ready' },
            { name: '风险评估推理', desc: '供应链风险多因子分析', icon: Activity, status: 'ready' },
            { name: '需求预测', desc: '基于历史数据的销量预测', icon: BarChart2, status: 'beta' },
            { name: '知识补全', desc: '缺失关系的自动推断', icon: Layers, status: 'beta' },
          ].map((task, i) => (
            <div key={i} className="bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2.5 cursor-pointer hover:border-neutral-600 transition-colors opacity-70">
              <div className="flex items-center gap-2 mb-1">
                <task.icon className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-neutral-300">{task.name}</span>
                {task.status === 'beta' && (
                  <span className="text-[8px] text-amber-400 bg-amber-500/10 px-1 py-0 rounded ml-auto">Beta</span>
                )}
              </div>
              <p className="text-[10px] text-neutral-500">{task.desc}</p>
            </div>
          ))}

          {/* 模型选择 */}
          <div className="mt-4 pt-3 border-t border-neutral-800">
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">推理模型</p>
            {[
              { name: 'MiniMax abab6.5s', role: '主推理引擎', active: true },
              { name: 'GPT-4o', role: '对比基线', active: false },
              { name: 'Claude 3.5', role: '复杂推理', active: false },
            ].map((model, i) => (
              <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[10px] ${
                model.active ? 'bg-cyan-500/10 text-cyan-400' : 'text-neutral-500'
              }`}>
                <Cpu className="w-3 h-3" />
                <span className="font-medium">{model.name}</span>
                <span className="text-neutral-600 ml-auto">{model.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 中列：推理过程可视化 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 推理链路可视化 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-neutral-500 mb-3 uppercase tracking-wider">推理链路可视化</p>

            {/* 推理步骤流 */}
            <div className="flex items-start gap-2">
              {[
                { step: '输入', desc: '用户问题 + 本体上下文', color: 'blue' },
                { step: '感知', desc: '实体识别 + 意图解析', color: 'cyan' },
                { step: '推理', desc: '多跳链路遍历 + 知识检索', color: 'violet' },
                { step: '生成', desc: '结构化答案 + 置信度', color: 'green' },
              ].map((node, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`flex-1 bg-${node.color}-500/5 border border-${node.color}-500/20 rounded-lg px-3 py-2 text-center`}>
                    <p className={`text-[10px] font-semibold text-${node.color}-400 mb-0.5`}>{node.step}</p>
                    <p className="text-[9px] text-neutral-500">{node.desc}</p>
                  </div>
                  {i < 3 && <ArrowRight className="w-3 h-3 text-neutral-700 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* 推理结果示例 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-neutral-500 mb-3 uppercase tracking-wider">推理结果示例</p>

            <div className="space-y-2">
              <div className="bg-neutral-800/50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-500 mb-1">问题</p>
                <p className="text-xs text-neutral-300">供应商 A 的原材料短缺会影响哪些下游产品？</p>
              </div>

              <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-blue-400 mb-1">推理路径</p>
                <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                  <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded">Supplier A</span>
                  <ArrowRight className="w-2.5 h-2.5 text-neutral-600" />
                  <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded">钴粉 (RawMaterial)</span>
                  <ArrowRight className="w-2.5 h-2.5 text-neutral-600" />
                  <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded">NCM811 正极 (Component)</span>
                  <ArrowRight className="w-2.5 h-2.5 text-neutral-600" />
                  <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">长续航电池包 (Product)</span>
                </div>
              </div>

              <div className="bg-green-500/5 border border-green-500/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-green-400 mb-1">结论 <span className="text-neutral-600 ml-1">置信度 92%</span></p>
                <p className="text-xs text-neutral-300">钴粉短缺将影响 NCM811 正极材料生产，进而影响长续航电池包的交付。建议启动备选供应商 B 的采购流程。</p>
              </div>
            </div>
          </div>

          {/* 模型对比 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 opacity-60">
            <p className="text-[10px] font-semibold text-neutral-500 mb-3 uppercase tracking-wider">模型对比 (A/B)</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { model: 'MiniMax', accuracy: '89%', latency: '1.2s', cost: '¥0.03' },
                { model: 'GPT-4o', accuracy: '93%', latency: '2.8s', cost: '¥0.12' },
                { model: 'Claude 3.5', accuracy: '91%', latency: '2.1s', cost: '¥0.08' },
              ].map((m, i) => (
                <div key={i} className="bg-neutral-800/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold text-neutral-300 mb-1">{m.model}</p>
                  <div className="space-y-0.5 text-[9px] text-neutral-500">
                    <p>准确率: <span className="text-green-400">{m.accuracy}</span></p>
                    <p>延迟: <span className="text-cyan-400">{m.latency}</span></p>
                    <p>成本: <span className="text-amber-400">{m.cost}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
