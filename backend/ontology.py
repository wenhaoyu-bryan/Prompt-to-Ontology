"""
语义层 (Ontology Engine)：使用 NetworkX 构建企业本体图谱。
支持：影响分析、最短路径查找、上下游链路遍历。
类型由 Neo4j 数据驱动，不硬编码。
"""

import networkx as nx
from neo4j_connector import (
    fetch_all_suppliers,
    fetch_all_raw_materials,
    fetch_all_components,
    fetch_all_final_products,
    fetch_all_factories,
    fetch_all_links,
    fetch_all_nodes_filtered,
    fetch_all_links_filtered,
    fetch_node_by_id,
    get_supplier_for_material,
    get_downstream_components_for_material,
    get_downstream_products_for_component,
    get_driver,
)


# 全局图实例
_ontology_graph: nx.DiGraph | None = None

# 动态调色板 — 黄金角度分布确保色相不重叠
_COLOR_PALETTE = [
    "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7",
    "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#6366f1",
    "#84cc16", "#d946ef", "#0ea5e9", "#e11d48", "#65a30d",
]

_SIZE_PALETTE = [15, 17, 20, 15, 22, 16, 14, 18, 19, 15]


# ============================================================
# 泛型构建函数
# ============================================================

def _discover_labels() -> list[str]:
    """从 Neo4j 自动发现所有节点标签"""
    try:
        driver = get_driver()
        with driver.session() as session:
            result = session.run("CALL db.labels()")
            return sorted([r["label"] for r in result])
    except Exception:
        return ["Supplier", "RawMaterial", "Component", "FinalProduct", "Factory"]


def _assign_color(label: str, index: int) -> str:
    return _COLOR_PALETTE[index % len(_COLOR_PALETTE)]


def _assign_size(label: str, index: int) -> int:
    return _SIZE_PALETTE[index % len(_SIZE_PALETTE)]


def _compute_alert(node: dict) -> bool:
    """通用告警判断 — 不依赖节点类型"""
    if node.get('stock') is not None and node.get('threshold') is not None:
        if node['stock'] < node['threshold']:
            return True
    if node.get('yieldRatio') is not None and node['yieldRatio'] < 0.8:
        return True
    if node.get('capacityUtilization') is not None and node['capacityUtilization'] < 0.3:
        return True
    if node.get('status') in ('Maintenance', 'Shutdown', 'At_Risk', 'Critical', 'Stock_Low', 'Behind_Schedule'):
        return True
    if node.get('riskLevel') == 'High':
        return True
    if node.get('defectRate') is not None and node['defectRate'] > 0.04:
        return True
    if node.get('daysRemaining') is not None and node['daysRemaining'] < 3:
        return True
    return node.get('alert', False) is True


def build_graph(dataset: str | None = None) -> nx.DiGraph:
    """从 Neo4j 数据构建有向语义图谱（类型无关），支持 dataset 过滤"""
    global _ontology_graph
    G = nx.DiGraph()

    if dataset and dataset != "all":
        # 使用 filtered 查询
        all_nodes = fetch_all_nodes_filtered(dataset)
        all_links = fetch_all_links_filtered(dataset)

        # 按 label 分组
        labels = sorted(set(n["label"] for n in all_nodes))
        color_idx = 0

        for label in labels:
            label_nodes = [n for n in all_nodes if n["label"] == label]
            color = _assign_color(label, color_idx)
            size = _assign_size(label, color_idx)
            color_idx += 1

            for node in label_nodes:
                node_id = node.get("id", "")
                node_label = node.get("name") or node.get("brand_name") or node.get("ingredient_name") or node.get("rule_name") or node.get("product_name") or node.get("species_name") or node.get("stage_name") or node.get("label", node_id)
                alert = _compute_alert(node)
                G.add_node(
                    node_id,
                    label=node_label,
                    object_type=label,
                    color=color,
                    size=size,
                    alert=alert,
                    **{k: v for k, v in node.items()
                       if k not in ('id', 'name', 'label', 'alert', 'object_type', 'color', 'size')},
                )

        for link in all_links:
            edge_attrs = {
                "label": link.get("label", ""),
                "link_type": link.get("link_type", ""),
            }
            for k, v in link.items():
                if k not in ("source_id", "target_id", "link_type", "label") and v is not None:
                    edge_attrs[k] = v
            G.add_edge(link["source_id"], link["target_id"], **edge_attrs)
    else:
        # 全量构建（原有逻辑）
        labels = _discover_labels()
        color_idx = 0
        size_idx = 0

        for label in labels:
            nodes = _fetch_nodes_by_label(label)
            color = _assign_color(label, color_idx)
            size = _assign_size(label, size_idx)
            color_idx += 1
            size_idx += 1

            for node in nodes:
                node_id = node.get("id", "")
                node_label = node.get("name") or node.get("brand_name") or node.get("ingredient_name") or node.get("rule_name") or node.get("product_name") or node.get("species_name") or node.get("stage_name") or node.get("label", node_id)
                alert = _compute_alert(node)
                G.add_node(
                    node_id,
                    label=node_label,
                    object_type=label,
                    color=color,
                    size=size,
                    alert=alert,
                    **{k: v for k, v in node.items()
                       if k not in ('id', 'name', 'label', 'alert', 'object_type', 'color', 'size')},
                )

        for link in fetch_all_links():
            edge_attrs = {
                "label": link.get("label", ""),
                "link_type": link.get("link_type", ""),
            }
            for k, v in link.items():
                if k not in ("source_id", "target_id", "link_type", "label") and v is not None:
                    edge_attrs[k] = v
            G.add_edge(link["source_id"], link["target_id"], **edge_attrs)

    _ontology_graph = G
    return G


def _fetch_nodes_by_label(label: str) -> list[dict]:
    """获取指定标签的所有节点"""
    # 尝试使用专用的 fetch 函数（保持兼容）
    fetch_map = {
        "Supplier": fetch_all_suppliers,
        "RawMaterial": fetch_all_raw_materials,
        "Component": fetch_all_components,
        "FinalProduct": fetch_all_final_products,
        "Factory": fetch_all_factories,
    }
    if label in fetch_map:
        return fetch_map[label]()

    # 泛型 fallback：直接用 Cypher 查询
    try:
        driver = get_driver()
        with driver.session() as session:
            result = session.run(f"MATCH (n:`{label}`) RETURN n")
            return [dict(r["n"]) for r in result]
    except Exception:
        return []


# =====================================================
# 图操作
# =====================================================

def get_graph(dataset: str | None = None) -> nx.DiGraph:
    global _ontology_graph
    if dataset and dataset != "all":
        return build_graph(dataset)
    if _ontology_graph is None:
        return build_graph()
    return _ontology_graph


def refresh_graph(dataset: str | None = None):
    return build_graph(dataset)


# =====================================================
# 图谱数据序列化（供前端渲染）
# =====================================================

def get_graph_data(dataset: str | None = None) -> dict:
    """返回 {nodes, links} 供 D3 渲染，通用版（不硬编码属性）"""
    G = get_graph(dataset)
    nodes = []
    _internal_keys = {'object_type', 'color', 'size', 'alert'}

    for node_id, attrs in G.nodes(data=True):
        node_data = {
            "id": node_id,
            "label": attrs.get("label", node_id),
            "objectType": attrs.get("object_type", ""),
            "type": attrs.get("object_type", ""),
            "color": attrs.get("color", "#6b7280"),
            "size": attrs.get("size", 10),
            "alert": attrs.get("alert", False),
            "dataset": attrs.get("dataset", ""),
        }
        # 透传所有其他属性
        for k, v in attrs.items():
            if k not in _internal_keys and k not in node_data:
                node_data[k] = v
        nodes.append(node_data)

    links = []
    for src, dst, attrs in G.edges(data=True):
        links.append({
            "source": src,
            "target": dst,
            "label": attrs.get("label", ""),
            "linkType": attrs.get("link_type", ""),
            "relationship": attrs.get("link_type", ""),
        })

    return {"nodes": nodes, "links": links}


# =====================================================
# 节点详情（Object 360）
# =====================================================

def get_node_detail(node_id: str) -> dict | None:
    """获取节点详情（通用版，不硬编码属性）"""
    G = get_graph()

    # 如果图中没有，尝试从 Neo4j 直接查询
    if node_id not in G.nodes:
        try:
            driver = get_driver()
            with driver.session() as session:
                result = session.run(
                    "MATCH (n {id: $id}) RETURN labels(n)[0] AS label, n",
                    id=node_id
                )
                record = result.single()
                if not record:
                    return None
                node = dict(record["n"])
                node["object_type"] = record["label"]
                return _format_node_detail(node_id, node, G)
        except Exception:
            return None

    attrs = dict(G.nodes[node_id])
    return _format_node_detail(node_id, attrs, G)


def _format_node_detail(node_id: str, attrs: dict, G: nx.DiGraph) -> dict:
    """格式化节点详情（通用版）"""
    _internal_keys = {'id', 'name', 'label', 'object_type', 'color', 'size', 'alert'}
    properties = {}
    for k, v in attrs.items():
        if k not in _internal_keys and v is not None:
            properties[k] = v

    detail = {
        "id": node_id,
        "name": attrs.get("name") or attrs.get("brand_name") or attrs.get("ingredient_name") or attrs.get("rule_name") or attrs.get("product_name") or attrs.get("species_name") or attrs.get("stage_name") or attrs.get("label", node_id),
        "object_type": attrs.get("object_type", "Unknown"),
        "dataset": attrs.get("dataset", ""),
        "properties": properties,
    }

    outgoing = []
    incoming = []
    if node_id in G:
        for _, dst, edge_attrs in G.out_edges(node_id, data=True):
            target_node = G.nodes[dst]
            link = {
                "targetId": dst,
                "targetLabel": target_node.get("label", dst),
                "targetType": target_node.get("object_type", ""),
                "linkType": edge_attrs.get("link_type", ""),
                "label": edge_attrs.get("label", ""),
            }
            # 透传所有其他边属性（severity, evidence, reason 等）
            for k, v in edge_attrs.items():
                if k not in ('link_type', 'label') and v is not None:
                    link[k] = v
            outgoing.append(link)
        for src, _, edge_attrs in G.in_edges(node_id, data=True):
            source_node = G.nodes[src]
            link = {
                "sourceId": src,
                "sourceLabel": source_node.get("label", src),
                "sourceType": source_node.get("object_type", ""),
                "linkType": edge_attrs.get("link_type", ""),
                "label": edge_attrs.get("label", ""),
            }
            for k, v in edge_attrs.items():
                if k not in ('link_type', 'label') and v is not None:
                    link[k] = v
            incoming.append(link)

    detail["outgoing_links"] = outgoing
    detail["incoming_links"] = incoming
    return detail


# =====================================================
# 影响分析 (原"爆炸半径")
# =====================================================

def get_impact_analysis(node_id: str, depth: int = 3) -> dict:
    """BFS 向下游遍历，找出受影响范围"""
    G = get_graph()
    if node_id not in G.nodes:
        return {"error": f"节点 {node_id} 不存在"}

    affected = {}
    queue = [(node_id, 0)]
    visited = set()

    while queue:
        current, d = queue.pop(0)
        if d > depth or current in visited:
            continue
        visited.add(current)
        node_attrs = G.nodes[current]
        affected[current] = {
            "depth": d,
            "label": node_attrs.get("label", current),
            "object_type": node_attrs.get("object_type", ""),
            "alert": node_attrs.get("alert", False),
        }
        for src, dst in G.out_edges(current):
            if dst not in visited:
                queue.append((dst, d + 1))

    return {
        "source_node_id": node_id,
        "source_label": G.nodes[node_id].get("label", node_id),
        "affected_nodes": affected,
        "total_affected": len(affected) - 1,
    }


# 向后兼容别名
get_blast_radius = get_impact_analysis


def highlight_path(node_id: str) -> dict:
    """路径高亮：找出直接上下游"""
    G = get_graph()
    if node_id not in G.nodes:
        return {"error": f"节点 {node_id} 不存在"}

    upstream = set()
    downstream = set()

    for src in G.predecessors(node_id):
        upstream.add(src)
        for s2 in G.predecessors(src):
            upstream.add(s2)

    for dst in G.successors(node_id):
        downstream.add(dst)
        for d2 in G.successors(dst):
            downstream.add(d2)

    all_linked = upstream | downstream | {node_id}
    return {
        "node_id": node_id,
        "upstream": list(upstream),
        "downstream": list(downstream),
        "highlighted_node_ids": list(all_linked),
    }


def find_shortest_path_to_product(from_id: str, to_id: str) -> dict:
    G = get_graph()
    try:
        path = nx.shortest_path(G, source=from_id, target=to_id)
        path_details = []
        for i, nid in enumerate(path):
            node = G.nodes[nid]
            path_details.append({
                "step": i + 1, "node_id": nid,
                "label": node.get("label", nid),
                "object_type": node.get("object_type", ""),
            })
        return {
            "from": G.nodes[from_id].get("label", from_id),
            "to": G.nodes[to_id].get("label", to_id),
            "path_length": len(path),
            "path": path_details,
        }
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return {"error": f"从 {from_id} 到 {to_id} 没有可达路径"}


def get_all_alert_nodes() -> list[dict]:
    G = get_graph()
    alerts = []
    for node_id, attrs in G.nodes(data=True):
        if attrs.get("alert"):
            alerts.append({
                "id": node_id,
                "label": attrs.get("label", node_id),
                "objectType": attrs.get("object_type", ""),
                "details": {
                    "stock": attrs.get("stock"),
                    "threshold": attrs.get("threshold"),
                    "currentYield": attrs.get("current_yield") or attrs.get("currentYield"),
                    "targetYield": attrs.get("target_yield") or attrs.get("targetYield"),
                    "riskLevel": attrs.get("risk_level") or attrs.get("riskLevel"),
                },
            })
    return alerts


def get_supplier_risk_summary() -> list[dict]:
    G = get_graph()
    summary = []
    for node_id, attrs in G.nodes(data=True):
        if attrs.get("object_type") == "Supplier":
            supplied_materials = []
            for dst in G.successors(node_id):
                mat = G.nodes[dst]
                supplied_materials.append({
                    "id": dst,
                    "label": mat.get("label", dst),
                    "stock": mat.get("stock", 0),
                    "threshold": mat.get("threshold", 0),
                    "alert": mat.get("alert", False),
                })
            summary.append({
                "id": node_id,
                "label": attrs.get("label", node_id),
                "riskLevel": attrs.get("risk_level") or attrs.get("riskLevel", ""),
                "onTimeDeliveryRate": attrs.get("on_time_delivery_rate") or attrs.get("onTimeDeliveryRate", 0),
                "suppliedMaterials": supplied_materials,
                "alertCount": sum(1 for m in supplied_materials if m["alert"]),
            })
    risk_order = {"High": 0, "Medium": 1, "Low": 2}
    summary.sort(key=lambda x: risk_order.get(x.get("riskLevel", ""), 3))
    return summary
