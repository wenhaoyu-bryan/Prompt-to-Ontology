import { ExternalLink } from 'lucide-react';

const LINK_TYPE_BADGE = {
  SUPPLIES: { label: '供应', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  USED_IN: { label: '生产用料', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  ASSEMBLED_INTO: { label: '总装构成', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  MANUFACTURED_AT: { label: '生产于', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

export default function LinkTooltip({ link, position, onNavigate }) {
  if (!link) return null;

  const sourceId = link.source?.id || link.source;
  const targetId = link.target?.id || link.target;
  const sourceLabel = link.source?.label || sourceId;
  const targetLabel = link.target?.label || targetId;
  const linkType = (link.linkType || link.relationship || '').toUpperCase();
  const badge = LINK_TYPE_BADGE[linkType] || LINK_TYPE_BADGE.SUPPLIES;
  const label = link.label || '';

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={{
        left: Math.min(position.x + 15, window.innerWidth - 260),
        top: Math.min(position.y - 10, window.innerHeight - 120),
      }}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl px-3.5 py-3 min-w-[220px] max-w-[260px]">
        {/* 关系类型 */}
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border font-medium mb-2 ${badge.color}`}>
          {badge.label}
        </span>

        {/* 路径 */}
        <div className="flex items-center gap-1.5 text-xs mb-2">
          <span className="text-white font-medium truncate max-w-[80px]">{sourceLabel}</span>
          <span className="text-neutral-600">→</span>
          <span className="text-white font-medium truncate max-w-[80px]">{targetLabel}</span>
        </div>

        {/* 链路标签 */}
        {label && (
          <p className="text-[10px] text-neutral-500 mb-2">{label}</p>
        )}

        {/* ID */}
        <p className="text-[10px] text-neutral-700 font-mono">
          {sourceId} → {targetId}
        </p>

        {/* 操作按钮 */}
        <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-neutral-800">
          {targetId && onNavigate && (
            <button
              onClick={() => onNavigate(targetId)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 text-[10px] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              定位目标
            </button>
          )}
          {sourceId && onNavigate && (
            <button
              onClick={() => onNavigate(sourceId)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-400 text-[10px] transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              定位源
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
