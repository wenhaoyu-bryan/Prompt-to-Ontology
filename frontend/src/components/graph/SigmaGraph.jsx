import { useEffect, useRef, useState } from 'react';
import { Button, Space, theme } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from '@ant-design/icons';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import { DEFAULT_EDGE_PROGRAM_CLASSES } from 'sigma/settings';
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve';
import { NodeBorderProgram } from '@sigma/node-border';
import { DEFAULT_NODE_PROGRAM_CLASSES } from 'sigma/settings';

const COLORS = {
  PetFoodProduct: '#5c70e8', Ingredient: '#159a88', Brand: '#a774dc',
  RiskRule: '#cb617e', Species: '#3a9fc3', LifeStage: '#bc9853',
};

export function typeColor(type) { return COLORS[type] || '#8492a8'; }

function isDarkColor(color) {
  const hex = color?.replace('#', '');
  if (!hex || hex.length !== 6) return false;
  return (parseInt(hex.slice(0, 2), 16) * 0.299 + parseInt(hex.slice(2, 4), 16) * 0.587 + parseInt(hex.slice(4, 6), 16) * 0.114) < 128;
}

/** Render only actual runtime nodes and edges; the parent owns filters and selection. */
export default function SigmaGraph({ data, mode, selectedId, highlightedEdges, onNodeSelect, onEdgeSelect, zh }) {
  const hostRef = useRef(null);
  const sigmaRef = useRef(null);
  const callbacks = useRef({ onNodeSelect, onEdgeSelect });
  const [error, setError] = useState(false);
  const { token } = theme.useToken();
  const dark = isDarkColor(token.colorBgContainer);
  callbacks.current = { onNodeSelect, onEdgeSelect };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !data.nodes.length) return undefined;
    const graph = new Graph({ type: 'directed', multi: true, allowSelfLoops: true });
    const sorted = [...data.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const columns = [[], [], [], [], []];
    sorted.forEach(node => {
      const type = node.objectType || node.type;
      const column = ['Brand', 'Species', 'LifeStage'].includes(type) ? 0 : type === 'PetFoodProduct' ? 1 : type === 'Ingredient' ? 2 : type === 'RiskRule' ? 3 : 4;
      columns[column].push(node);
    });
    const populated = columns.filter(column => column.length);
    const positions = new Map();
    populated.forEach((column, columnIndex) => column.forEach((node, index) => positions.set(node.id, {
      x: (columnIndex - (populated.length - 1) / 2) * 1.7,
      y: ((column.length - 1) / 2 - index) * 0.18,
    })));
    sorted.forEach((node, index) => {
      const angle = 2 * Math.PI * index / sorted.length;
      const type = node.objectType || node.type;
      const position = mode === 'global' ? positions.get(node.id) : { x: Math.cos(angle), y: Math.sin(angle) };
      graph.addNode(String(node.id), {
        x: position.x, y: position.y,
        label: String(node.label || node.id), size: type === 'PetFoodProduct' ? 8 : 6,
        color: typeColor(type), borderColor: dark ? '#152536' : '#e5edf5', type: 'border', typeName: type,
      });
    });
    const pairs = new Map();
    data.links.forEach(edge => {
      const key = JSON.stringify([String(edge.source), String(edge.target)].sort());
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(edge);
    });
    pairs.forEach(edges => edges.sort((a, b) => String(a.id).localeCompare(String(b.id))));
    data.links.forEach(edge => {
      const source = String(edge.source); const target = String(edge.target);
      if (edge.id && graph.hasNode(source) && graph.hasNode(target) && !graph.hasEdge(String(edge.id))) {
        const siblings = pairs.get(JSON.stringify([source, target].sort()));
        const offset = siblings.indexOf(edge) - (siblings.length - 1) / 2;
        const curvature = offset * 0.3 * (source <= target ? 1 : -1);
        graph.addDirectedEdgeWithKey(String(edge.id), source, target, {
          label: edge.linkType || edge.relationship || '', size: 0.8, color: dark ? '#60829b' : '#a4bac8',
          type: curvature ? 'curvedArrow' : 'arrow', curvature,
        });
      }
    });
    if (mode !== 'global' && graph.order > 1 && graph.size > 0) {
      forceAtlas2.assign(graph, { iterations: 100, settings: { ...forceAtlas2.inferSettings(graph), gravity: 1 } });
    }
    let renderer;
    try {
      const drawLabel = (ctx, node) => {
        if (!node.label) return;
        const limit = mode === 'global' ? 20 : 30;
        const text = node.label.length > limit ? `${node.label.slice(0, limit - 1)}…` : node.label;
        ctx.font = '500 11px system-ui, sans-serif';
        const width = ctx.measureText(text).width + 12;
        const x = node.x + node.size + 6; const y = node.y - 9;
        ctx.fillStyle = dark ? 'rgba(10, 19, 31, 0.92)' : 'rgba(255, 255, 255, 0.92)';
        ctx.beginPath(); ctx.roundRect(x, y, width, 18, 5); ctx.fill();
        ctx.fillStyle = dark ? '#d8e4ef' : '#314659';
        ctx.fillText(text, x + 6, y + 12);
      };
      renderer = new Sigma(graph, host, {
        renderEdgeLabels: true, enableEdgeEvents: true, labelRenderedSizeThreshold: 6, stagePadding: 80,
        labelColor: { color: token.colorText }, labelFont: 'system-ui, sans-serif', labelSize: 11,
        defaultDrawNodeLabel: drawLabel, defaultDrawNodeHover: drawLabel,
        nodeProgramClasses: { ...DEFAULT_NODE_PROGRAM_CLASSES, border: NodeBorderProgram },
        defaultEdgeType: 'arrow', edgeProgramClasses: { ...DEFAULT_EDGE_PROGRAM_CLASSES, curvedArrow: EdgeCurvedArrowProgram },
        edgeLabelColor: { color: token.colorText }, zIndex: true,
      });
      sigmaRef.current = renderer;
      renderer.on('clickNode', ({ node }) => callbacks.current.onNodeSelect?.(node));
      renderer.on('clickEdge', ({ edge }) => callbacks.current.onEdgeSelect?.(edge));
      setError(false);
    } catch (err) {
      console.error('Graph renderer failed:', err);
      setError(true);
    }
    return () => { renderer?.kill(); sigmaRef.current = null; };
  }, [data, mode, token.colorText, dark]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const emphasis = new Set(highlightedEdges || []);
    renderer.setSetting('nodeReducer', (node, attrs) => ({ ...attrs,
      size: node === selectedId ? attrs.size * 1.7 : attrs.size,
      color: node === selectedId ? (dark ? '#efca81' : '#c18a3e') : attrs.color,
      borderColor: node === selectedId ? (dark ? '#8b6632' : '#f0d8b4') : attrs.borderColor,
      forceLabel: node === selectedId,
    }));
    renderer.setSetting('edgeReducer', (edge, attrs) => ({ ...attrs,
      color: emphasis.has(edge) ? (dark ? '#89dce7' : '#247a9e') : attrs.color,
      size: emphasis.has(edge) ? 2 : attrs.size,
      label: emphasis.has(edge) ? attrs.label : '',
      forceLabel: emphasis.has(edge), zIndex: emphasis.has(edge) ? 1 : 0,
    }));
    renderer.refresh();
  }, [data, selectedId, highlightedEdges, dark]);

  return <div style={{ position: 'relative', height: '100%', minHeight: 430 }}>
    <div ref={hostRef} data-testid="sigma-graph" aria-label={zh ? '实例关系图' : 'Instance relationship graph'} style={{ position: 'absolute', inset: 0 }} />
    {error && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: token.colorTextSecondary }}>{zh ? '图谱无法渲染，请检查浏览器图形支持。' : 'The graph could not render. Check browser graphics support.'}</div>}
    <Space.Compact style={{ position: 'absolute', right: 16, bottom: 16 }}>
      <Button aria-label={zh ? '放大' : 'Zoom in'} icon={<ZoomInOutlined />} onClick={() => sigmaRef.current?.getCamera().animatedZoom()} />
      <Button aria-label={zh ? '缩小' : 'Zoom out'} icon={<ZoomOutOutlined />} onClick={() => sigmaRef.current?.getCamera().animatedUnzoom()} />
      <Button aria-label={zh ? '适应画布' : 'Fit graph'} icon={<ExpandOutlined />} onClick={() => sigmaRef.current?.getCamera().animatedReset()} />
    </Space.Compact>
  </div>;
}
