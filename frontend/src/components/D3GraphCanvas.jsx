import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Loader2, WifiOff, RefreshCw, Search, ZoomIn, ZoomOut, Maximize2, Route,
  Settings, Trash2, X,
} from 'lucide-react';
import LinkTooltip from './LinkTooltip';
import OntologySchemaOverview from './OntologySchemaOverview';
import { fetchShortestPath, clearDataset } from '../api';

// =====================================================
// 常量
// =====================================================

// 动态尺寸：优先用节点的 size 属性，否则按类型分配
const DEFAULT_SIZE_MAP = {
  Factory: 22, FinalProduct: 20, Component: 17,
  RawMaterial: 15, Supplier: 15,
};
const DEFAULT_SIZE = 14;

const LINK_WIDTH_MAP = {
  SUPPLIES: 1.5, USED_IN: 2.5, ASSEMBLED_INTO: 3, MANUFACTURED_AT: 1.5,
};

const LINK_COLOR_MAP = {
  SUPPLIES: '#ef4444', USED_IN: '#3b82f6',
  ASSEMBLED_INTO: '#22c55e', MANUFACTURED_AT: '#a855f7',
};

function nodeSize(node) {
  if (node.size) return node.size;  // 优先用后端分配的尺寸
  const t = node.objectType || node.type || '';
  return DEFAULT_SIZE_MAP[t] || DEFAULT_SIZE;
}

// =====================================================
// Canvas 绘制函数 (从旧 GraphCanvas 复用)
// =====================================================

function drawHexagon(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y - h / 2);
  ctx.lineTo(x + w / 2 - radius, y - h / 2);
  ctx.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + radius);
  ctx.lineTo(x + w / 2, y + h / 2 - radius);
  ctx.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - radius, y + h / 2);
  ctx.lineTo(x - w / 2 + radius, y + h / 2);
  ctx.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - radius);
  ctx.lineTo(x - w / 2, y - h / 2 + radius);
  ctx.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + radius, y - h / 2);
  ctx.closePath();
}

function drawActionBadge(ctx, node, gs) {
  const s = nodeSize(node);
  const x = node.x + s * 0.7;
  const y = node.y - s * 0.7;
  const r = 8 / gs;
  const hasAction = node.alert
    || (node.objectType === 'Supplier' && node.riskLevel === 'High')
    || (node.objectType === 'FinalProduct' && node.yieldRatio < 0.8)
    || (node.objectType === 'Component' && node.daysRemaining < 3)
    || (node.objectType === 'RawMaterial' && node.alert);
  const locked = !hasAction;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = locked ? '#52525b' : '#22c55e';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5 / gs;
  ctx.stroke();

  // 闪电/锁图标
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2 / gs;
  ctx.beginPath();
  if (locked) {
    // 小锁
    const lr = r * 0.45;
    ctx.rect(x - lr, y - lr * 0.2, lr * 2, lr * 1.4);
    ctx.moveTo(x - lr * 0.5, y - lr * 0.2);
    ctx.arc(x, y - lr * 0.2, lr * 0.5, Math.PI, 0);
  } else {
    // 闪电
    ctx.moveTo(x, y - r * 0.5);
    ctx.lineTo(x + r * 0.2, y - r * 0.1);
    ctx.lineTo(x - r * 0.1, y + r * 0.1);
    ctx.lineTo(x, y + r * 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

// =====================================================
// 数据集管理器
// =====================================================

function DatasetManager({ datasets, currentDataset, onDelete }) {
  const [open, setOpen] = useState(false);

  if (datasets.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg bg-neutral-900/90 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
        title="数据集管理"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute top-0 left-10 z-50 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
            <span className="text-xs font-semibold text-neutral-300">数据集管理</span>
            <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {datasets.map((ds) => (
              <div
                key={ds.name}
                className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-neutral-800/50 last:border-0 ${
                  currentDataset === ds.name ? 'bg-cyan-500/5' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`truncate font-medium ${currentDataset === ds.name ? 'text-cyan-400' : 'text-neutral-300'}`}>
                    {ds.label}
                  </p>
                  <p className="text-[9px] text-neutral-500">
                    {ds.nodeCount} 节点 · {ds.relCount} 关系
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete?.(ds.name); }}
                  className="p-1 rounded text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  title={`删除 ${ds.label}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// =====================================================
// 主组件
// =====================================================

export default function D3GraphCanvas({
  graphData, graphLoading, graphError, onRetry,
  selectedNode, queriedNodeIds, highlightedNodeIds,
  onNodeClick, onRunAgent,
  datasets = [], currentDataset = 'all', onDatasetChange,
}) {
  const containerRef = useRef();
  const svgRef = useRef();
  const nodeCanvasRef = useRef();
  const overlayCanvasRef = useRef();
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const transformRef = useRef(d3.zoomIdentity);
  const queryTimestamps = useRef({});

  const [dims, setDims] = useState({ width: 600, height: 500 });
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showPathFinder, setShowPathFinder] = useState(false);
  const [pathFrom, setPathFrom] = useState('');
  const [pathTo, setPathTo] = useState('');
  const [pathResult, setPathResult] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [, setTick] = useState(0);

  // ---- 容器尺寸 ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) setDims({ width: clientWidth, height: clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- 查询时间戳 ----
  const prevQueriedRef = useRef([]);
  useEffect(() => {
    const now = Date.now();
    queriedNodeIds.forEach(id => {
      if (!prevQueriedRef.current.includes(id)) queryTimestamps.current[id] = now;
    });
    prevQueriedRef.current = queriedNodeIds;
  }, [queriedNodeIds]);

  // ---- 搜索 ----
  useEffect(() => {
    if (!searchText.trim()) { setSearchResults([]); return; }
    const q = searchText.toLowerCase();
    setSearchResults(
      graphData.nodes.filter(n => (n.label || '').toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).slice(0, 8)
    );
  }, [searchText, graphData.nodes]);

  // ---- D3 力模拟初始化 ----
  useEffect(() => {
    if (!graphData.nodes.length) return;

    const svg = d3.select(svgRef.current);
    const nodeCanvas = nodeCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const nodeCtx = nodeCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');

    // 设置 Canvas 分辨率
    const pxRatio = window.devicePixelRatio || 1;
    [nodeCanvas, overlayCanvas].forEach(c => {
      c.width = dims.width * pxRatio;
      c.height = dims.height * pxRatio;
      c.style.width = dims.width + 'px';
      c.style.height = dims.height + 'px';
    });
    nodeCtx.scale(pxRatio, pxRatio);
    overlayCtx.scale(pxRatio, pxRatio);

    // --- 力模拟 ---
    const sim = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(dims.width / 2, dims.height / 2))
      .alphaDecay(0.015)
      .velocityDecay(0.25);

    simulationRef.current = sim;

    // --- 缩放 (绑定到容器，避免被 Canvas 层拦截) ---
    const zoom = d3.zoom()
      .scaleExtent([0.3, 6])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        svg.select('.links-group').attr('transform', event.transform);
        svg.select('.link-labels-group').attr('transform', event.transform);
        renderNodes();
        renderOverlay();
      });

    zoomRef.current = zoom;

    // 绑定到容器 div 而非 SVG，这样 Canvas 上的滚轮/拖拽也能触发缩放
    const container = d3.select(containerRef.current);
    container.call(zoom);

    // 禁止双击缩放 (避免与节点双击选中冲突)
    container.on('dblclick.zoom', null);

    // --- SVG 连线 ---
    const linksGroup = svg.select('.links-group');
    const labelsGroup = svg.select('.link-labels-group');

    // --- 渲染节点 (Canvas) ---
    function renderNodes() {
      const ctx = nodeCtx;
      const gs = transformRef.current.k;
      ctx.save();
      ctx.clearRect(0, 0, dims.width, dims.height);
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(gs, gs);

      graphData.nodes.forEach(node => {
        if (!isFinite(node.x) || !isFinite(node.y)) return;
        const objType = node.objectType || node.type || '';
        const label = node.label || node.id;
        const color = node.color || '#6b7280';
        const isAlert = node.alert;
        const isSelected = selectedNode?.id === node.id;
        const isDimmed = highlightedNodeIds?.length > 0 && !highlightedNodeIds.includes(node.id) && !isSelected;
        const s = nodeSize(node);
        const alpha = isDimmed ? 0.18 : 1;

        ctx.globalAlpha = alpha;
        ctx.save();

        // 告警光晕
        if (isAlert && !isDimmed) {
          ctx.save();
          const grad = ctx.createRadialGradient(node.x, node.y, s * 0.5, node.x, node.y, s * 2.2);
          grad.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(node.x, node.y, s * 2.2, 0, Math.PI * 2); ctx.fill();
          const pulse = Math.sin(Date.now() / 700) * 0.25 + 0.75;
          ctx.strokeStyle = `rgba(239, 68, 68, ${pulse * 0.55})`;
          ctx.lineWidth = 2.5 / gs;
          ctx.beginPath(); ctx.arc(node.x, node.y, s * 1.8, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }

        // 选中高亮
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 4 / gs;
          ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
          ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(node.x, node.y, s + 10, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }

        // 按类型绘制形状
        if (objType === 'RawMaterial') {
          drawHexagon(ctx, node.x, node.y, s * 0.9);
          ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = isSelected ? 2.5 / gs : 1.8 / gs;
          ctx.strokeStyle = isSelected ? '#fff' : '#1e293b'; ctx.stroke();
          ctx.beginPath(); ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
        } else if (objType === 'Component') {
          drawDiamond(ctx, node.x, node.y, s);
          ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = isSelected ? 2.5 / gs : 1.8 / gs;
          ctx.strokeStyle = isSelected ? '#fff' : '#1e293b'; ctx.stroke();
        } else if (objType === 'FinalProduct') {
          ctx.beginPath(); ctx.arc(node.x, node.y, s * 1.1, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = isSelected ? 3 / gs : 2 / gs;
          ctx.strokeStyle = isSelected ? '#fff' : '#14532d'; ctx.stroke();
          ctx.beginPath(); ctx.arc(node.x, node.y, s * 0.55, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.5 / gs; ctx.stroke();
        } else if (objType === 'Supplier') {
          drawRoundedRect(ctx, node.x, node.y, s * 1.6, s * 1.2, 4);
          ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = isSelected ? 2.5 / gs : 1.8 / gs;
          ctx.strokeStyle = isSelected ? '#fff' : '#1e293b'; ctx.stroke();
        } else if (objType === 'Factory') {
          drawRoundedRect(ctx, node.x, node.y, s * 2.2, s * 1.4, 5);
          ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = isSelected ? 3 / gs : 1.8 / gs;
          ctx.strokeStyle = isSelected ? '#fff' : '#1e293b'; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 0.5 / gs;
          ctx.beginPath(); ctx.moveTo(node.x - s * 0.6, node.y); ctx.lineTo(node.x + s * 0.6, node.y); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(node.x, node.y, s * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
          ctx.lineWidth = 1 / gs; ctx.strokeStyle = '#374151'; ctx.stroke();
        }

        // 标签 (根据缩放级别显隐)
        if (gs > 0.4 && !isDimmed) {
          const fontSize = gs > 1.5 ? 12 : 10;
          ctx.fillStyle = '#e5e5e5';
          ctx.font = `${fontSize / gs}px "PingFang SC", "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(label, node.x, node.y + s + 5);

          // 指标副标签 (缩放 > 0.8x 时显示)
          if (gs > 0.8) {
            let metric = '';
            if (objType === 'RawMaterial' && node.stock != null) {
              metric = `${node.stock}${node.unit || 't'}`;
            } else if (objType === 'Component' && node.daysRemaining != null) {
              metric = `${node.daysRemaining.toFixed(1)}d`;
            } else if (objType === 'FinalProduct' && node.yieldRatio != null) {
              metric = `${(node.yieldRatio * 100).toFixed(0)}%`;
            } else if (objType === 'Supplier' && node.riskLevel) {
              metric = node.riskLevel;
            } else if (objType === 'Factory' && node.capacityUtilization != null) {
              metric = `${(node.capacityUtilization * 100).toFixed(0)}%`;
            }
            if (metric) {
              ctx.fillStyle = metric.startsWith('H') ? '#ef4444' :
                metric.endsWith('d') && parseFloat(metric) < 3 ? '#ef4444' : '#737373';
              ctx.font = `${8 / gs}px "PingFang SC", "Microsoft YaHei", sans-serif`;
              ctx.fillText(metric, node.x, node.y + s + 14);
            }
          }
        }

        // 动作标记 (闪电图标)
        if (!isDimmed) drawActionBadge(ctx, node, gs);

        ctx.restore();
      });

      ctx.restore();
    }

    // --- 渲染叠加层 (选中动画 & 瞄准圈) ---
    function renderOverlay() {
      const ctx = overlayCtx;
      const gs = transformRef.current.k;
      ctx.save();
      ctx.clearRect(0, 0, dims.width, dims.height);
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(gs, gs);

      graphData.nodes.forEach(node => {
        if (!isFinite(node.x) || !isFinite(node.y)) return;
        const isQueried = queriedNodeIds.includes(node.id);

        // 瞄准圈动画
        if (isQueried && queryTimestamps.current[node.id]) {
          const elapsed = Date.now() - queryTimestamps.current[node.id];
          if (elapsed < 2000) {
            const p = elapsed / 2000;
            const outerR = nodeSize(node) + 8 + p * 35;
            const a = 1 - p;
            ctx.save();
            ctx.strokeStyle = `rgba(249, 115, 22, ${a * 0.9})`;
            ctx.lineWidth = 2.5 / gs;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(node.x - outerR, node.y); ctx.lineTo(node.x - nodeSize(node) - 4, node.y);
            ctx.moveTo(node.x + nodeSize(node) + 4, node.y); ctx.lineTo(node.x + outerR, node.y);
            ctx.moveTo(node.x, node.y - outerR); ctx.lineTo(node.x, node.y - nodeSize(node) - 4);
            ctx.moveTo(node.x, node.y + nodeSize(node) + 4); ctx.lineTo(node.x, node.y + outerR);
            ctx.stroke();
            ctx.setLineDash([3, 5]);
            ctx.beginPath(); ctx.arc(node.x, node.y, outerR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(249, 115, 22, ${a * 0.35})`;
            ctx.stroke();
            ctx.restore();
          }
        }
      });
      ctx.restore();
    }

    // --- 渲染连线 (SVG) ---
    function renderLinks() {
      // 连线路径 (箭头停在节点边缘)
      linksGroup.selectAll('line').remove();
      linksGroup.selectAll('line')
        .data(graphData.links)
        .join('line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => {
          const ts = nodeSize(d.target);
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.hypot(dx, dy) || 1;
          return d.target.x - (dx / dist) * (ts + 6);
        })
        .attr('y2', d => {
          const ts = nodeSize(d.target);
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.hypot(dx, dy) || 1;
          return d.target.y - (dy / dist) * (ts + 6);
        })
        .attr('stroke', d => {
          const t = (d.linkType || d.relationship || '').toUpperCase();
          return LINK_COLOR_MAP[t] || '#525252';
        })
        .attr('stroke-opacity', 0.55)
        .attr('stroke-width', d => {
          const t = (d.linkType || d.relationship || '').toUpperCase();
          return LINK_WIDTH_MAP[t] || 1.5;
        })
        .attr('marker-end', d => {
          const t = (d.linkType || d.relationship || '').toUpperCase();
          return `url(#arrow-${t.toLowerCase()})`;
        })
        .style('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
          setHoveredLink(d);
          setMousePos({ x: event.offsetX, y: event.offsetY });
          d3.select(this).attr('stroke-opacity', 1).attr('stroke-width', d => {
            const t = (d.linkType || d.relationship || '').toUpperCase();
            return (LINK_WIDTH_MAP[t] || 1.5) + 1.5;
          });
        })
        .on('mousemove', (event) => setMousePos({ x: event.offsetX, y: event.offsetY }))
        .on('mouseleave', function() {
          setHoveredLink(null);
          d3.select(this).attr('stroke-opacity', 0.55).attr('stroke-width', d => {
            const t = (d.linkType || d.relationship || '').toUpperCase();
            return LINK_WIDTH_MAP[t] || 1.5;
          });
        })
        .on('click', (event, d) => {
          event.stopPropagation();
          if (d.target && d.target.id) onNodeClick({ id: d.target.id, label: d.target.label || d.target.id }, event);
        });

      // 链路标签
      labelsGroup.selectAll('text').remove();
      if (transformRef.current.k >= 0.6) {
        labelsGroup.selectAll('text')
          .data(graphData.links)
          .join('text')
          .attr('x', d => (d.source.x + d.target.x) / 2)
          .attr('y', d => (d.source.y + d.target.y) / 2 - 6)
          .attr('text-anchor', 'middle')
          .attr('fill', '#52525b')
          .attr('font-size', '9')
          .attr('font-family', '"PingFang SC", "Microsoft YaHei", sans-serif')
          .text(d => d.label || '');
      }
    }

    // --- 模拟 tick ---
    sim.on('tick', () => {
      renderLinks();
      renderNodes();
      renderOverlay();
      setTick(t => t + 1);  // 驱动 React 重渲染 (tooltip)
    });

    sim.on('end', () => {
      renderLinks();
      renderNodes();
      renderOverlay();
    });

    // --- Canvas 点击 → 节点检测 ---
    function canvasClickHandler(event) {
      const rect = nodeCanvas.getBoundingClientRect();
      const mx = (event.clientX - rect.left) * (dims.width / rect.width);
      const my = (event.clientY - rect.top) * (dims.height / rect.height);
      const t = transformRef.current;
      const gs = t.k;
      // 逆变换到图坐标
      const gx = (mx - t.x) / gs;
      const gy = (my - t.y) / gs;

      // 检测动作图标点击
      for (const node of graphData.nodes) {
        if (!isFinite(node.x) || !isFinite(node.y)) continue;
        const s = nodeSize(node);
        const bx = node.x + s * 0.7;
        const by = node.y - s * 0.7;
        const br = 8 / gs;
        const dist = Math.hypot(gx - bx, gy - by);
        if (dist < br + 3) {
          event.stopPropagation();
          onRunAgent && onRunAgent(node.id);
          return;
        }
      }

      // 检测节点点击
      let closest = null;
      let minDist = Infinity;
      for (const node of graphData.nodes) {
        if (!isFinite(node.x) || !isFinite(node.y)) continue;
        const s = nodeSize(node);
        const dist = Math.hypot(gx - node.x, gy - node.y);
        if (dist < s + 8 && dist < minDist) {
          minDist = dist;
          closest = node;
        }
      }
      if (closest) {
        onNodeClick(closest);
      }
    }
    nodeCanvas.addEventListener('click', canvasClickHandler);

    return () => {
      sim.stop();
      nodeCanvas.removeEventListener('click', canvasClickHandler);
    };
  }, [graphData, dims, selectedNode, queriedNodeIds, highlightedNodeIds]);

  // ---- 初始 zoomToFit ----
  useEffect(() => {
    if (graphData.nodes.length > 0 && containerRef.current) {
      const timer = setTimeout(() => {
        const svg = d3.select(svgRef.current);
        const bbox = svg.select('.links-group').node()?.getBBox();
        if (bbox && bbox.width > 0) {
          const tx = (dims.width - bbox.width * 1.2) / 2 - bbox.x * 1.2;
          const ty = (dims.height - bbox.height * 1.2) / 2 - bbox.y * 1.2;
          const s = 0.85 / Math.max(bbox.width / dims.width, bbox.height / dims.height);
          const container = d3.select(containerRef.current);
          container.transition().duration(500).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(tx, ty).scale(Math.min(s, 1.5))
          );
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [graphData.nodes.length, dims]);

  // ---- 选中节点聚焦 ----
  useEffect(() => {
    if (!selectedNode || !containerRef.current) return;
    const node = graphData.nodes.find(n => n.id === selectedNode.id);
    if (!node || !isFinite(node.x)) return;
    const container = d3.select(containerRef.current);
    container.transition().duration(500).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(dims.width / 2 - node.x * 1.6, dims.height / 2 - node.y * 1.6).scale(1.6)
    );
  }, [selectedNode, graphData.nodes, dims]);

  // ---- 缩放控制 ----
  const handleZoom = (factor) => {
    if (!containerRef.current) return;
    const container = d3.select(containerRef.current);
    container.transition().duration(300).call(
      zoomRef.current.scaleBy, factor
    );
  };

  const handleZoomToFit = () => {
    if (!containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const bbox = svg.select('.links-group').node()?.getBBox();
    if (bbox && bbox.width > 0) {
      const tx = (dims.width - bbox.width * 1.2) / 2 - bbox.x * 1.2;
      const ty = (dims.height - bbox.height * 1.2) / 2 - bbox.y * 1.2;
      const s = 0.85 / Math.max(bbox.width / dims.width, bbox.height / dims.height);
      const container = d3.select(containerRef.current);
      container.transition().duration(400).call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(Math.min(s, 1.5))
      );
    }
  };

  // ---- 搜索选中 ----
  const handleSearchSelect = (node) => {
    onNodeClick(node);
    setSearchText('');
    setShowSearch(false);
  };

  // ---- 最短路径 ----
  const handleFindPath = async () => {
    if (!pathFrom || !pathTo) return;
    try {
      const result = await fetchShortestPath(pathFrom, pathTo);
      setPathResult(result);
      if (result.path) {
        const ids = result.path.map(p => p.node_id);
        onNodeClick?.(graphData.nodes.find(n => n.id === ids[ids.length-1]) || graphData.nodes[0]);
      }
    } catch { setPathResult({ error: '查询失败' }); }
  };

  // ---- Esc 关闭搜索 ----
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setShowSearch(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // =====================================================
  // JSX
  // =====================================================
  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      {/* --- Schema 概览（可折叠） --- */}
      <OntologySchemaOverview dataset={currentDataset} />

      {/* --- 图谱画布 --- */}
      <div className="flex-1 relative bg-[#0a0a0a] overflow-hidden">
      {/* --- SVG 层: 连线 + 箭头 + 标签 --- */}
      <svg ref={svgRef} className="absolute inset-0 z-10" width={dims.width} height={dims.height}>
        <defs>
          {Object.entries(LINK_COLOR_MAP).map(([type, color]) => (
            <marker
              key={type}
              id={`arrow-${type.toLowerCase()}`}
              viewBox="0 -5 10 10"
              refX="10" refY="0"
              markerWidth="6" markerHeight="6"
              orient="auto"
            >
              <path d="M0,-5L10,0L0,5" fill={color} />
            </marker>
          ))}
        </defs>
        <g className="links-group" />
        <g className="link-labels-group" />
      </svg>

      {/* --- Canvas 层: 节点 --- */}
      <canvas ref={nodeCanvasRef} className="absolute inset-0 z-20" />

      {/* --- Canvas 层: 动画叠加 --- */}
      <canvas ref={overlayCanvasRef} className="absolute inset-0 z-30 pointer-events-none" />

      {/* --- 数据集过滤器 (左上角) --- */}
      {datasets.length > 0 && (
        <div className="absolute top-3 left-3 z-40 flex items-center gap-2">
          <select
            value={currentDataset}
            onChange={(e) => onDatasetChange?.(e.target.value)}
            className="bg-neutral-900/90 border border-neutral-700 rounded-lg px-3 py-1.5
                       text-xs text-neutral-300 outline-none focus:border-cyan-500/50
                       backdrop-blur-sm cursor-pointer"
          >
            <option value="all">全部数据集</option>
            {datasets.map((ds) => (
              <option key={ds.name} value={ds.name}>
                {ds.label} ({ds.nodeCount} 节点)
              </option>
            ))}
          </select>
          <DatasetManager
            datasets={datasets}
            currentDataset={currentDataset}
            onDelete={(dsName) => {
              if (confirm(`确定删除数据集「${dsName}」？此操作不可撤销。`)) {
                import('../api').then(({ clearDataset }) =>
                  clearDataset(dsName).then(() => onDatasetChange?.('all'))
                );
              }
            }}
          />
        </div>
      )}

      {/* --- 浮动工具栏 --- */}
      <div className="absolute top-3 right-3 z-40 flex items-center gap-1">
        <button onClick={() => setShowSearch(!showSearch)}
          className="p-1.5 rounded-lg bg-neutral-900/85 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
          title="搜索 (Esc 关闭)">
          <Search className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setShowPathFinder(!showPathFinder)}
          className={`p-1.5 rounded-lg border transition-colors ${showPathFinder ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-neutral-900/85 border-neutral-700 text-neutral-400 hover:text-white'}`}
          title="最短路径">
          <Route className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-neutral-700" />
        <button onClick={() => handleZoom(1.3)}
          className="p-1.5 rounded-lg bg-neutral-900/85 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
          title="放大">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => handleZoom(0.75)}
          className="p-1.5 rounded-lg bg-neutral-900/85 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
          title="缩小">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleZoomToFit}
          className="p-1.5 rounded-lg bg-neutral-900/85 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
          title="适应视图">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* --- 搜索面板 --- */}
      {showSearch && (
        <div className="absolute top-12 right-3 z-40 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
          <input
            type="text" value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索节点..."
            autoFocus
            className="w-full bg-transparent text-xs text-white px-3 py-2.5 outline-none placeholder-neutral-600 border-b border-neutral-800"
          />
          {searchResults.length > 0 && (
            <div className="max-h-60 overflow-y-auto">
              {searchResults.map(n => (
                <button key={n.id}
                  onClick={() => handleSearchSelect(n)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 text-left text-xs text-neutral-300">
                  <span className="w-2 h-2 rounded-full" style={{ background: n.color || '#6b7280' }} />
                  <span className="truncate flex-1">{n.label}</span>
                  <span className="text-[10px] text-neutral-600">{n.id}</span>
                </button>
              ))}
            </div>
          )}
          {searchText && searchResults.length === 0 && (
            <p className="text-[10px] text-neutral-600 text-center py-3">无匹配节点</p>
          )}
        </div>
      )}

      {/* --- 路径查找面板 --- */}
      {showPathFinder && (
        <div className="absolute top-12 right-3 z-40 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-3">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">最短路径</p>
          <input type="text" value={pathFrom} onChange={e => setPathFrom(e.target.value)}
            placeholder="起始节点 ID (如 RM-301)"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-white px-2.5 py-1.5 mb-2 outline-none focus:border-green-500/50 placeholder-neutral-600" />
          <input type="text" value={pathTo} onChange={e => setPathTo(e.target.value)}
            placeholder="目标节点 ID (如 FP-301)"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-white px-2.5 py-1.5 mb-2 outline-none focus:border-green-500/50 placeholder-neutral-600" />
          <button onClick={handleFindPath}
            className="w-full py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors mb-2">
            查找路径
          </button>
          {pathResult && !pathResult.error && pathResult.path && (
            <div className="text-[10px] text-neutral-400 space-y-0.5 max-h-32 overflow-y-auto">
              <p className="text-green-400">路径长度: {pathResult.path_length} 步</p>
              {pathResult.path.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-neutral-600 w-4">{p.step}.</span>
                  <span className="text-white">{p.label}</span>
                  <span className="text-neutral-600">({p.object_type})</span>
                </div>
              ))}
            </div>
          )}
          {pathResult?.error && <p className="text-[10px] text-red-400">{pathResult.error}</p>}
        </div>
      )}

      {/* --- 悬浮链路 tooltip --- */}
      {hoveredLink && (
        <LinkTooltip
          link={hoveredLink}
          position={mousePos}
          onNavigate={(nodeId) => {
            const node = graphData.nodes.find(n => n.id === nodeId);
            if (node) onNodeClick(node);
            setHoveredLink(null);
          }}
        />
      )}

      {/* --- 加载 / 错误覆盖层 --- */}
      {(graphLoading || graphError || graphData.nodes.length === 0) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/90 z-50">
          {graphLoading && (
            <>
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
              <p className="text-sm text-neutral-300 font-medium">正在加载图谱...</p>
            </>
          )}
          {!graphLoading && graphError && (
            <>
              <WifiOff className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-sm text-red-300 font-medium mb-1">后端服务未连接</p>
              <button onClick={onRetry}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg">
                <RefreshCw className="w-3.5 h-3.5" /> 重新连接
              </button>
            </>
          )}
          {!graphLoading && !graphError && graphData.nodes.length === 0 && (
            <>
              <WifiOff className="w-10 h-10 text-amber-400 mb-3" />
              <p className="text-sm text-amber-300 font-medium">图谱数据为空</p>
              <button onClick={onRetry}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg">
                <RefreshCw className="w-3.5 h-3.5" /> 重新加载
              </button>
            </>
          )}
        </div>
      )}

      {/* --- 图例（动态生成） --- */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-neutral-500 bg-neutral-900/85 backdrop-blur px-3.5 py-2.5 rounded-lg border border-neutral-800 z-40">
        {(() => {
          const seen = new Map();
          for (const n of graphData.nodes) {
            const t = n.objectType || n.type || '';
            if (t && !seen.has(t)) seen.set(t, n.color || '#6b7280');
          }
          return [...seen.entries()].map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {type}
            </span>
          ));
        })()}
      </div>

      {/* --- 节点统计 --- */}
      <div className="absolute bottom-4 right-4 text-[10px] text-neutral-600 bg-neutral-900/85 backdrop-blur px-2.5 py-1.5 rounded-lg border border-neutral-800 z-40">
        {graphData.nodes.length} 节点 · {graphData.links.length} 链路
      </div>
      </div> {/* 关闭图谱画布 */}
    </div>
  );
}
