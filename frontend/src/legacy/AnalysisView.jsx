import { BarChart3, TrendingUp, PieChart, ArrowUpRight, ArrowDownRight, Lock, Filter, Download } from 'lucide-react';

/**
 * AnalysisView — 分析面板（原型）
 * 展示 EVA 风格的数据洞察、KPI 仪表盘、趋势分析
 */
export default function AnalysisView() {
  // 模拟 KPI 数据
  const kpis = [
    { label: '节点总数', value: '31,316', change: '+2,840', up: true, color: 'cyan' },
    { label: '关系链路', value: '89,420', change: '+12,500', up: true, color: 'purple' },
    { label: '活跃告警', value: '3', change: '-2', up: false, color: 'red' },
    { label: '数据质量', value: '96.2%', change: '+1.3%', up: true, color: 'green' },
  ];

  const typeDistribution = [
    { type: 'SalesOrder', count: 15000, pct: 47.9, color: '#22d3ee' },
    { type: 'InventoryRecord', count: 10000, pct: 31.9, color: '#a78bfa' },
    { type: 'Customer', count: 5000, pct: 16.0, color: '#34d399' },
    { type: 'Product', count: 1116, pct: 3.6, color: '#fbbf24' },
    { type: 'Supplier', count: 200, pct: 0.6, color: '#f87171' },
  ];

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">数据分析</h2>
              <p className="text-[11px] text-neutral-500">Analytics · KPI 仪表盘 + 趋势洞察 + 数据质量</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 flex items-center gap-1">
              <Lock className="w-3 h-3" /> 开发中
            </span>
            <button disabled className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-neutral-500 bg-neutral-800 rounded-lg border border-neutral-700 cursor-not-allowed">
              <Filter className="w-3 h-3" /> 筛选
            </button>
            <button disabled className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-neutral-500 bg-neutral-800 rounded-lg border border-neutral-700 cursor-not-allowed">
              <Download className="w-3 h-3" /> 导出
            </button>
          </div>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* KPI 卡片 */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3">
              <p className="text-[10px] text-neutral-500 mb-1">{kpi.label}</p>
              <div className="flex items-end justify-between">
                <span className="text-xl font-bold text-white">{kpi.value}</span>
                <span className={`flex items-center gap-0.5 text-[10px] ${kpi.up ? 'text-green-400' : 'text-red-400'}`}>
                  {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {kpi.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 中间行：趋势图 + 分布 */}
        <div className="grid grid-cols-3 gap-3">
          {/* 趋势图（模拟） */}
          <div className="col-span-2 bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">月度趋势</p>
              <div className="flex gap-2">
                {['节点', '关系', '告警'].map((tab, i) => (
                  <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${
                    i === 0 ? 'bg-cyan-500/10 text-cyan-400' : 'text-neutral-600'
                  }`}>{tab}</span>
                ))}
              </div>
            </div>

            {/* 模拟柱状图 */}
            <div className="flex items-end gap-1.5 h-32">
              {[35, 42, 38, 55, 48, 62, 58, 71, 65, 78, 82, 90].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-gradient-to-t from-cyan-600/40 to-cyan-400/20 rounded-t-sm transition-all"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[7px] text-neutral-600">{['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 类型分布 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">节点类型分布</p>

            {/* 模拟饼图 */}
            <div className="flex items-center justify-center mb-3">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  {(() => {
                    let offset = 0;
                    return typeDistribution.map((item, i) => {
                      const dashArray = `${item.pct * 1.01} ${100 - item.pct * 1.01}`;
                      const el = (
                        <circle
                          key={i}
                          cx="18" cy="18" r="15.9"
                          fill="none"
                          stroke={item.color}
                          strokeWidth="3"
                          strokeDasharray={dashArray}
                          strokeDashoffset={-offset}
                        />
                      );
                      offset += item.pct * 1.01;
                      return el;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">31.3K</span>
                </div>
              </div>
            </div>

            {/* 图例 */}
            <div className="space-y-1">
              {typeDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-neutral-400 flex-1">{item.type}</span>
                  <span className="text-neutral-500 font-mono">{item.count.toLocaleString()}</span>
                  <span className="text-neutral-600 w-10 text-right">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部：数据质量 + 告警 */}
        <div className="grid grid-cols-2 gap-3">
          {/* 数据质量 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">数据质量指标</p>
            <div className="space-y-2">
              {[
                { metric: '完整性', score: 98.5, color: '#22d3ee' },
                { metric: '一致性', score: 95.2, color: '#a78bfa' },
                { metric: '时效性', score: 92.8, color: '#34d399' },
                { metric: '准确性', score: 97.1, color: '#fbbf24' },
              ].map((q, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-neutral-400 w-12">{q.metric}</span>
                  <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${q.score}%`, backgroundColor: q.color }} />
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">{q.score}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* 告警列表 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">活跃告警</p>
            <div className="space-y-2">
              {[
                { level: '高', msg: '供应商 CC母婴 交货延迟 3 天', time: '2 小时前' },
                { level: '中', msg: '产品 10045 库存低于安全水位', time: '5 小时前' },
                { level: '低', msg: '客户 宏达科技 信用额度即将用尽', time: '1 天前' },
              ].map((alert, i) => (
                <div key={i} className="flex items-start gap-2 bg-neutral-800/30 rounded-lg px-3 py-2">
                  <span className={`text-[8px] px-1 py-0.5 rounded font-semibold ${
                    alert.level === '高' ? 'bg-red-500/20 text-red-400' :
                    alert.level === '中' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>{alert.level}</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-300">{alert.msg}</p>
                    <p className="text-[9px] text-neutral-600 mt-0.5">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部说明 */}
        <div className="text-center py-2">
          <p className="text-[10px] text-neutral-600">
            数据基于当前图谱 · 更新时间: {new Date().toLocaleString('zh-CN')}
          </p>
        </div>
      </div>
    </div>
  );
}
