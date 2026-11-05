import { useMemo } from "react";
import { Background, Controls, MarkerType, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export default function DesignTypeMap({ catalog, onSelect, tr }) {
  const { nodes, edges } = useMemo(() => {
    const objects = Object.values(catalog.object_types || {});
    const names = new Set(objects.map((item) => item.name));
    return {
      nodes: objects.map((item, index) => ({
        id: item.name,
        position: { x: (index % 3) * 300, y: Math.floor(index / 3) * 160 },
        data: {
          label: (
            <div className="od-map-node">
              <small>{item.name}</small>
              <strong>{item.label || item.name}</strong>
              <span>
                {item.properties.length} {tr("properties", "个属性")}
              </span>
            </div>
          ),
        },
        style: { width: 230 },
        ariaLabel: `${tr("Object definition", "对象定义")} ${item.name}`,
      })),
      edges: Object.values(catalog.link_types || {})
        .filter(
          (item) => names.has(item.source_type) && names.has(item.target_type),
        )
        .map((item) => ({
          id: item.name,
          source:
            item.direction === "incoming" ? item.target_type : item.source_type,
          target:
            item.direction === "incoming" ? item.source_type : item.target_type,
          label: item.label || item.name,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          markerStart:
            item.direction === "bidirectional"
              ? { type: MarkerType.ArrowClosed }
              : undefined,
          ariaLabel: `${tr("Relationship definition", "关系定义")} ${item.name}`,
        })),
    };
  }, [catalog, tr]);

  return (
    <section
      className="od-type-map"
      aria-label={tr("Ontology type map", "本体类型图")}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, node) => onSelect("objectTypes", node.id)}
        onEdgeClick={(_, edge) => onSelect("linkTypes", edge.id)}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}
