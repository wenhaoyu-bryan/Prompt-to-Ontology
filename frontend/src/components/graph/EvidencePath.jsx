import { useMemo } from 'react';
import { Background, Controls, ReactFlow, MarkerType, Position } from '@xyflow/react';
import { theme } from 'antd';
import '@xyflow/react/dist/style.css';
import './evidencePath.css';

/** A path derived only from the answer payload, not from the runtime graph. */
export default function EvidencePath({ path, zh, onEvidence }) {
  const { token } = theme.useToken();
  const { nodes, edges } = useMemo(() => {
    const seen = new Map();
    path.forEach(step => {
      if (!seen.has(step.source_id)) seen.set(step.source_id, seen.size);
      if (!seen.has(step.target_id)) seen.set(step.target_id, seen.size);
    });
    return {
      nodes: [...seen].map(([id, index]) => ({ id, position: { x: index * 240, y: 50 }, data: { label: id }, draggable: false,
        sourcePosition: Position.Right, targetPosition: Position.Left,
        style: { background: token.colorBgContainer, color: token.colorText, border: `1px solid ${token.colorBorder}`, borderRadius: 8 } })),
      edges: path.map((step, index) => ({ id: `path-${index}`, source: step.source_id, target: step.target_id,
        label: step.relation, markerEnd: { type: MarkerType.ArrowClosed }, data: { evidenceIds: step.evidence_ids },
        style: { stroke: token.colorPrimary, strokeWidth: 2 }, labelStyle: { fontSize: 11, fill: token.colorText },
        labelBgStyle: { fill: token.colorBgContainer }, labelBgPadding: [5, 3], labelBgBorderRadius: 4 })),
    };
  }, [path, token.colorBgContainer, token.colorBorder, token.colorPrimary, token.colorText]);
  if (!path.length) return null;
  return <div className="evidence-flow" data-testid="evidence-path" aria-label={zh ? '样例证据路径' : 'Sample evidence path'} style={{ height: 230, borderRadius: 10, overflow: 'hidden', '--flow-bg': token.colorBgContainer, '--flow-text': token.colorText, '--flow-border': token.colorBorder }}>
    <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ maxZoom: 1, padding: 0.2 }} nodesDraggable={false} nodesConnectable={false}
      onEdgeClick={(_, edge) => onEvidence?.(edge.data.evidenceIds)} zoomOnScroll={false} proOptions={{ hideAttribution: true }}>
      <Background gap={22} color={token.colorBorderSecondary} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
