import { useEffect, useRef, useState } from 'react';
import { Button, Space, theme } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from '@ant-design/icons';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import { DEFAULT_EDGE_PROGRAM_CLASSES } from 'sigma/settings';
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve';

const COLORS = {
  PetFoodProduct: '#5b6ee1', Ingredient: '#25a883', Brand: '#b36acf',
  RiskRule: '#e87b63', Species: '#439bd1', LifeStage: '#d99b42',
};

export function typeColor(type) { return COLORS[type] || '#8492a8'; }

/** Render only actual runtime nodes and edges; the parent owns filters and selection. */
export default function SigmaGraph({ data, selectedId, highlightedEdges, onNodeSelect, onEdgeSelect, zh }) {
  const hostRef = useRef(null);
  const sigmaRef = useRef(null);
  const callbacks = useRef({ onNodeSelect, onEdgeSelect });
  const [error, setError] = useState(false);
  const { token } = theme.useToken();
  callbacks.current = { onNodeSelect, onEdgeSelect };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !data.nodes.length) return undefined;
    const graph = new Graph({ type: 'directed', multi: true, allowSelfLoops: true });
    const sorted = [...data.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    sorted.forEach((node, index) => {
      const angle = 2 * Math.PI * index / sorted.length;
      const type = node.objectType || node.type;
      graph.addNode(String(node.id), {
        x: Math.cos(angle), y: Math.sin(angle),
        label: String(node.label || node.id), size: type === 'PetFoodProduct' ? 10 : 7,
        color: typeColor(type), typeName: type,
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
          label: edge.linkType || edge.relationship || '', size: 1.3, color: '#a5b3ca',
          type: curvature ? 'curvedArrow' : 'arrow', curvature,
        });
      }
    });
    if (graph.order > 1 && graph.size > 0) {
      forceAtlas2.assign(graph, { iterations: 100, settings: { ...forceAtlas2.inferSettings(graph), gravity: 1 } });
    }
    let renderer;
    try {
      renderer = new Sigma(graph, host, {
        renderEdgeLabels: true, enableEdgeEvents: true, labelRenderedSizeThreshold: 7, stagePadding: 80,
        labelColor: { color: token.colorText }, labelFont: 'system-ui, sans-serif', labelSize: 12,
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
  }, [data, token.colorText]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const emphasis = new Set(highlightedEdges || []);
    renderer.setSetting('nodeReducer', (node, attrs) => ({ ...attrs,
      size: node === selectedId ? attrs.size * 1.4 : attrs.size,
      forceLabel: node === selectedId,
    }));
    renderer.setSetting('edgeReducer', (edge, attrs) => ({ ...attrs,
      color: emphasis.has(edge) ? token.colorPrimary : attrs.color,
      size: emphasis.has(edge) ? 3 : attrs.size,
      label: emphasis.has(edge) ? attrs.label : '',
      forceLabel: emphasis.has(edge), zIndex: emphasis.has(edge) ? 1 : 0,
    }));
    renderer.refresh();
  }, [data, selectedId, highlightedEdges, token.colorPrimary]);

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
