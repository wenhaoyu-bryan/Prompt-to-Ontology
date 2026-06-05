"""
Pet Food Neo4j Writer — 将 graph payload 写入 Neo4j。
使用 MERGE 避免重复，支持安全 reset（仅清除 pet_food 数据）。
"""

from typing import Any
from neo4j import Driver
from neo4j_connector import get_driver

# Pet Food 相关的全部 label
PET_FOOD_LABELS = ["PetFoodProduct", "Brand", "Ingredient", "RiskRule", "Species", "LifeStage"]


def ensure_constraints(driver: Driver | None = None):
    """为 Pet Food 节点创建唯一性约束（如不存在则创建）。"""
    driver = driver or get_driver()
    constraints = [
        ("PetFoodProduct", "product_id"),
        ("Brand", "brand_id"),
        ("Ingredient", "ingredient_id"),
        ("RiskRule", "rule_id"),
        ("Species", "species_id"),
        ("LifeStage", "stage_id"),
    ]
    with driver.session() as session:
        for label, prop in constraints:
            constraint_name = f"uniq_{label.lower()}_{prop}"
            try:
                session.run(
                    f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS "
                    f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE"
                )
            except Exception:
                # 旧版 Neo4j 语法兼容
                try:
                    session.run(
                        f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS "
                        f"ON (n:{label}) ASSERT n.{prop} IS UNIQUE"
                    )
                except Exception:
                    pass  # 约束可能已存在


def clear_pet_food_data(driver: Driver | None = None):
    """仅清除 Pet Food 相关节点和边，不影响工业 demo 数据。"""
    driver = driver or get_driver()
    with driver.session() as session:
        session.run(
            "MATCH (n) WHERE n:PetFoodProduct OR n:Brand OR n:Ingredient OR n:RiskRule OR n:Species OR n:LifeStage "
            "DETACH DELETE n"
        )


def _merge_node(session, node: dict):
    """MERGE 单个节点（自动注入 dataset='pet_food' 标签）。"""
    label = node["label"]
    node_id = node["id"]
    props = node["properties"]

    # 动态构建 SET 子句
    set_parts = ["n.dataset = 'pet_food'"]
    params = {"node_id": node_id}
    for k, v in props.items():
        if v is not None:
            safe_key = k.replace("-", "_")
            set_parts.append(f"n.`{k}` = ${safe_key}")
            params[safe_key] = v

    set_clause = "SET " + ", ".join(set_parts)

    session.run(
        f"MERGE (n:`{label}` {{id: $node_id}}) {set_clause}",
        **params,
    )


def _merge_edge(session, edge: dict):
    """MERGE 单条边（自动注入 dataset='pet_food' 标签）。"""
    rel_type = edge["type"]
    props = edge.get("properties", {})

    # 动态构建 SET 子句
    set_parts = ["r.dataset = 'pet_food'"]
    params = {"source": edge["source"], "target": edge["target"]}
    for k, v in props.items():
        if v is not None:
            safe_key = k.replace("-", "_")
            set_parts.append(f"r.`{k}` = ${safe_key}")
            params[safe_key] = v

    set_clause = "SET " + ", ".join(set_parts)

    session.run(
        f"MATCH (a {{id: $source}}), (b {{id: $target}}) "
        f"MERGE (a)-[r:`{rel_type}`]->(b) {set_clause}",
        **params,
    )


def write_graph_payload(payload: dict, driver: Driver | None = None) -> dict:
    """
    将 graph payload 写入 Neo4j。

    Args:
        payload: {"nodes": [...], "edges": [...]}
        driver: Neo4j driver（可选，默认使用全局 driver）

    Returns:
        {"nodes_created": int, "edges_created": int, "label_counts": {...}, "relationship_counts": {...}}
    """
    driver = driver or get_driver()

    label_counts: dict[str, int] = {}
    rel_counts: dict[str, int] = {}

    with driver.session() as session:
        # 写入节点
        for node in payload["nodes"]:
            _merge_node(session, node)
            label = node["label"]
            label_counts[label] = label_counts.get(label, 0) + 1

        # 写入边
        for edge in payload["edges"]:
            _merge_edge(session, edge)
            rtype = edge["type"]
            rel_counts[rtype] = rel_counts.get(rtype, 0) + 1

    return {
        "nodes_created": sum(label_counts.values()),
        "edges_created": sum(rel_counts.values()),
        "label_counts": label_counts,
        "relationship_counts": rel_counts,
    }
