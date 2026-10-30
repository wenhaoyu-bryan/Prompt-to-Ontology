import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

function DefinitionNode({ data }) {
  return (
    <div className={`sd-map-node ${data.active ? "sd-map-active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <small>{data.caption}</small>
      <b>{data.label}</b>
      <div>{data.properties}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { definition: DefinitionNode };

export default function SchemaDesignMap({
  objects,
  links,
  activeSchema,
  onSelect,
  tr,
}) {
  const { nodes, edges } = useMemo(() => {
    const candidates = objects.filter(
      (o) => o.decision !== "excluded" && o.name,
    );
    const names = new Set(candidates.map((o) => o.name));
    const missing = [
      ...new Set(
        links
          .filter((l) => l.decision !== "excluded")
          .flatMap((l) => [l.from, l.to]),
      ),
    ].filter(
      (name) => name && !names.has(name) && activeSchema.object_types?.[name],
    );
    const all = [
      ...candidates,
      ...missing.map((name) => ({
        ...activeSchema.object_types[name],
        id: `active-${name}`,
        active: true,
      })),
    ];
    const ids = new Map(all.map((o) => [o.name, o.id]));
    const visibleLinks = links.filter(
      (l) => l.decision !== "excluded" && ids.has(l.from) && ids.has(l.to),
    );
    const incoming = new Map(all.map((o) => [o.name, 0]));
    const levels = new Map(all.map((o) => [o.name, 0]));
    visibleLinks.forEach((l) => incoming.set(l.to, incoming.get(l.to) + 1));
    const queue = all.filter((o) => !incoming.get(o.name)).map((o) => o.name);
    for (let i = 0; i < queue.length; i++) {
      const name = queue[i];
      visibleLinks
        .filter((l) => l.from === name)
        .forEach((l) => {
          levels.set(l.to, Math.max(levels.get(l.to), levels.get(name) + 1));
          incoming.set(l.to, incoming.get(l.to) - 1);
          if (!incoming.get(l.to)) queue.push(l.to);
        });
    }
    const rows = new Map();
    const positions = new Map(
      all.map((o) => {
        const level = levels.get(o.name);
        const row = rows.get(level) || 0;
        rows.set(level, row + 1);
        return [o.id, { x: level * 410, y: row * 150 }];
      }),
    );
    return {
      nodes: all.map((o) => ({
        id: o.id,
        type: "definition",
        position: positions.get(o.id),
        data: {
          label: o.name,
          active: o.active,
          caption: o.active
            ? tr("ACTIVE DEFINITION", "当前生效定义")
            : o.decision === "accepted"
              ? tr("CONFIRMED DRAFT", "已确认草稿")
              : tr("PROPOSED DEFINITION", "待确认定义"),
          properties: (o.properties || [])
            .slice(0, 3)
            .map((p) => p.name)
            .join(" · "),
        },
        selectable: !o.active,
      })),
      edges: visibleLinks.map((l) => ({
        id: l.id,
        source: ids.get(l.from),
        target: ids.get(l.to),
        label:
          l.label ||
          (l.name.startsWith("REFERENCES_")
            ? tr("References", "引用")
            : l.name) ||
          "?",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: "var(--ab-accent)",
          strokeDasharray: l.decision === "accepted" ? undefined : "5 4",
        },
        labelStyle: { fill: "var(--ab-text)", fontSize: 11 },
        labelBgStyle: { fill: "var(--ab-bg)" },
      })),
    };
  }, [objects, links, activeSchema, tr]);
  if (!nodes.length) return null;
  return (
    <section className="ab-panel sd-map-panel">
      <div className="ab-section-heading">
        <div>
          <h3>{tr("Definition map", "定义结构图")}</h3>
          <p>
            {tr(
              "Concepts and proposed relationships · dashed lines need confirmation · click a definition to edit",
              "概念与提议关系 · 虚线待确认 · 点击定义编辑",
            )}
          </p>
        </div>
        <span className="ab-muted">
          {tr("Schema, not instance data", "定义层，非实例数据")}
        </span>
      </div>
      <div
        className="sd-map"
        role="region"
        aria-label={tr("Proposed schema map", "提议本体结构图")}
      >
        <ReactFlow
          key={nodes.map((n) => n.id).join(",")}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => {
            if (!node.data.active) onSelect("objects", node.id);
          }}
          onEdgeClick={(_, edge) => onSelect("links", edge.id)}
          minZoom={0.3}
          maxZoom={1.3}
        >
          <Background gap={20} color="var(--ab-border)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
