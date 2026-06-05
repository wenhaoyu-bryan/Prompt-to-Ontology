"""
Neo4j 连接层 — 保持与 database.py 完全相同的函数签名
上层 ontology.py / agent.py 无需任何改动即可切换数据源

用法:
    替换 database.py 的 import:
    from neo4j_connector import (
        fetch_all_suppliers, fetch_all_raw_materials, ...
    )
"""

import os

from neo4j import GraphDatabase

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_AUTH = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", ""))

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)
    return _driver


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


# ============================================================
# 基础查询函数 (与 database.py 签名完全一致)
# ============================================================

def fetch_all_suppliers() -> list[dict]:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:Supplier)
            RETURN n.id AS id, n.name AS name,
                   n.riskLevel AS risk_level,
                   n.onTimeDeliveryRate AS on_time_delivery_rate,
                   n.location AS location, n.contact AS contact,
                   n.certification AS certification
        """)
        return [record.data() for record in result]


def fetch_all_raw_materials() -> list[dict]:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:RawMaterial)
            RETURN n.id AS id, n.name AS name,
                   n.stock AS stock, n.threshold AS threshold,
                   n.qualityScore AS quality_score,
                   n.unit AS unit, n.supplierId AS supplier_id
        """)
        return [record.data() for record in result]


def fetch_all_components() -> list[dict]:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:Component)
            RETURN n.id AS id, n.name AS name,
                   n.stock AS stock, n.dailyConsumption AS daily_consumption,
                   n.unit AS unit, n.defectRate AS defect_rate
        """)
        return [record.data() for record in result]


def fetch_all_final_products() -> list[dict]:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:FinalProduct)
            RETURN n.id AS id, n.name AS name,
                   n.targetYield AS target_yield,
                   n.currentYield AS current_yield,
                   n.unit AS unit, n.factoryId AS factory_id
        """)
        return [record.data() for record in result]


def fetch_all_factories() -> list[dict]:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:Factory)
            RETURN n.id AS id, n.name AS name,
                   n.location AS location, n.status AS status,
                   n.capacityUtilization AS capacity_utilization,
                   n.headcount AS headcount
        """)
        return [record.data() for record in result]


def fetch_all_links() -> list[dict]:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (a)-[r]->(b)
            RETURN a.id AS source_id, b.id AS target_id,
                   type(r) AS link_type, r.label AS label
        """)
        return [record.data() for record in result]


def fetch_node_by_id(node_id: str) -> dict | None:
    """根据 ID 在所有标签中查找实体"""
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n)
            WHERE n.id = $id
            RETURN n, labels(n)[0] AS label
        """, id=node_id)
        record = result.single()
        if record is None:
            return None
        node = dict(record["n"])
        node["object_type"] = record["label"]
        node["type"] = record["label"].lower() + "s"  # 兼容旧版
        return node


def update_raw_material_stock(material_id: str, new_stock: float) -> dict | None:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:RawMaterial {id: $id})
            SET n.stock = $stock
            SET n.alert = ($stock < n.threshold)
            RETURN n
        """, id=material_id, stock=new_stock)
        record = result.single()
        if record is None:
            return None
        node = dict(record["n"])
        node["object_type"] = "RawMaterial"
        node["type"] = "raw_materials"
        return node


def update_component_stock(component_id: str, new_stock: int) -> dict | None:
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n:Component {id: $id})
            SET n.stock = $stock
            SET n.daysRemaining = CASE
                WHEN n.dailyConsumption > 0 THEN $stock / n.dailyConsumption
                ELSE 0 END
            SET n.alert = (n.daysRemaining < 3)
            RETURN n
        """, id=component_id, stock=new_stock)
        record = result.single()
        if record is None:
            return None
        node = dict(record["n"])
        node["object_type"] = "Component"
        node["type"] = "components"
        return node


def get_downstream_components_for_material(material_id: str) -> list[dict]:
    """获取某个原材料所流向的所有零部件"""
    with get_driver().session() as session:
        result = session.run("""
            MATCH (:RawMaterial {id: $id})-[:USED_IN]->(c:Component)
            RETURN c.id AS id, c.name AS name,
                   c.stock AS stock, c.dailyConsumption AS daily_consumption,
                   c.unit AS unit, c.defectRate AS defect_rate
        """, id=material_id)
        return [record.data() for record in result]


def get_downstream_products_for_component(component_id: str) -> list[dict]:
    """获取某个零部件所装配的所有最终产品"""
    with get_driver().session() as session:
        result = session.run("""
            MATCH (:Component {id: $id})-[:ASSEMBLED_INTO]->(fp:FinalProduct)
            RETURN fp.id AS id, fp.name AS name,
                   fp.targetYield AS target_yield,
                   fp.currentYield AS current_yield,
                   fp.unit AS unit, fp.factoryId AS factory_id
        """, id=component_id)
        return [record.data() for record in result]


def get_supplier_for_material(material_id: str) -> dict | None:
    """获取某个原材料的供应商"""
    with get_driver().session() as session:
        result = session.run("""
            MATCH (s:Supplier)-[:SUPPLIES]->(:RawMaterial {id: $id})
            RETURN s.id AS id, s.name AS name,
                   s.riskLevel AS risk_level,
                   s.onTimeDeliveryRate AS on_time_delivery_rate,
                   s.location AS location, s.contact AS contact,
                   s.certification AS certification
        """, id=material_id)
        record = result.single()
        return record.data() if record else None


# ============================================================
# 数据集隔离 (Phase 7)
# ============================================================

def fetch_all_nodes_filtered(dataset: str | None = None) -> list[dict]:
    """获取所有节点，可按 dataset 过滤"""
    with get_driver().session() as session:
        if dataset and dataset != "all":
            if dataset == "legacy":
                result = session.run(
                    "MATCH (n) WHERE n.dataset IS NULL RETURN labels(n)[0] AS label, n"
                )
            else:
                result = session.run(
                    "MATCH (n {dataset: $ds}) RETURN labels(n)[0] AS label, n",
                    ds=dataset
                )
        else:
            result = session.run("MATCH (n) RETURN labels(n)[0] AS label, n")
        return [{"label": r["label"], **dict(r["n"])} for r in result]


def fetch_all_links_filtered(dataset: str | None = None) -> list[dict]:
    """获取所有关系，可按 dataset 过滤，返回所有关系属性"""
    with get_driver().session() as session:
        if dataset and dataset != "all":
            if dataset == "legacy":
                result = session.run("""
                    MATCH (a)-[r]->(b)
                    WHERE a.dataset IS NULL AND b.dataset IS NULL
                    RETURN a.id AS source_id, b.id AS target_id,
                           type(r) AS link_type, properties(r) AS props
                """)
            else:
                result = session.run("""
                    MATCH (a)-[r]->(b)
                    WHERE r.dataset = $ds OR (a.dataset = $ds AND b.dataset = $ds)
                    RETURN a.id AS source_id, b.id AS target_id,
                           type(r) AS link_type, properties(r) AS props
                """, ds=dataset)
        else:
            result = session.run("""
                MATCH (a)-[r]->(b)
                RETURN a.id AS source_id, b.id AS target_id,
                       type(r) AS link_type, properties(r) AS props
            """)
        rows = []
        for r in result:
            row = {"source_id": r["source_id"], "target_id": r["target_id"], "link_type": r["link_type"]}
            props = r["props"]
            row["label"] = props.pop("label", None)
            row.update(props)
            rows.append(row)
        return rows


def list_datasets() -> list[dict]:
    """列出所有数据集（Project）及其统计"""
    with get_driver().session() as session:
        result = session.run("""
            MATCH (n)
            WHERE n.dataset IS NOT NULL
            WITH n.dataset AS ds, count(n) AS nodeCount
            OPTIONAL MATCH (a {dataset: ds})-[r]->(b {dataset: ds})
            RETURN ds AS name, nodeCount, count(r) AS relCount
        """)
        datasets = []
        for r in result:
            datasets.append({
                "name": r["name"],
                "label": _dataset_display_name(r["name"]),
                "nodeCount": r["nodeCount"],
                "relCount": r["relCount"],
                "builtIn": r["name"] in ("demo", "legacy"),
            })
        # 检查没有 dataset 标签的旧数据
        legacy = session.run(
            "MATCH (n) WHERE n.dataset IS NULL RETURN count(n) AS cnt"
        ).single()
        if legacy["cnt"] > 0:
            legacy_rels = session.run("""
                MATCH (a)-[r]->(b)
                WHERE a.dataset IS NULL AND b.dataset IS NULL
                RETURN count(r) AS cnt
            """).single()
            datasets.insert(0, {
                "name": "legacy",
                "label": "新能源电池供应链（内置）",
                "nodeCount": legacy["cnt"],
                "relCount": legacy_rels["cnt"],
                "builtIn": True,
            })
        return datasets


def _dataset_display_name(name: str) -> str:
    mapping = {
        "demo": "新能源电池供应链（内置）",
        "legacy": "新能源电池供应链（内置）",
        "default": "默认数据集",
        "pet_food": "Pet Food Ontology",
    }
    return mapping.get(name, name)


# ============================================================
# 新增函数 (Neo4j 原生能力)
# ============================================================

def get_blast_radius_cypher(node_id: str, depth: int = 3) -> list[dict]:
    """使用 Cypher 图遍历取代 NetworkX BFS"""
    with get_driver().session() as session:
        result = session.run("""
            MATCH path = (start {id: $id})-[:USED_IN|ASSEMBLED_INTO*1..$depth]->(affected)
            RETURN affected.id AS id,
                   affected.name AS name,
                   labels(affected)[0] AS type,
                   length(path) AS depth
            ORDER BY depth
        """, id=node_id, depth=depth)
        return [record.data() for record in result]


def search_nodes(query: str) -> list[dict]:
    """使用 Neo4j 全文索引搜索节点"""
    with get_driver().session() as session:
        result = session.run("""
            CALL db.index.fulltext.queryNodes('node_search', $query)
            YIELD node, score
            RETURN node.id AS id, node.name AS name,
                   labels(node)[0] AS type, score
            ORDER BY score DESC
            LIMIT 20
        """, query=query)
        return [record.data() for record in result]


def bulk_import_raw_materials(rows: list[dict]) -> dict:
    """批量导入原材料 (供外部数据管道使用)"""
    count = 0
    with get_driver().session() as session:
        for row in rows:
            session.run("""
                MERGE (n:RawMaterial {id: $id})
                SET n.name = $name, n.stock = $stock,
                    n.threshold = $threshold, n.qualityScore = $quality,
                    n.unit = $unit, n.supplierId = $supplier_id,
                    n.alert = ($stock < $threshold)
            """, **row)
            count += 1
    return {"imported": count, "status": "ok"}


def bulk_import_links(rows: list[dict]) -> dict:
    """批量导入链路 (供外部数据管道使用)"""
    count = 0
    with get_driver().session() as session:
        for row in rows:
            rel_type = row.get("link_type", "").upper()
            session.run(f"""
                MATCH (a {{id: $source_id}})
                MATCH (b {{id: $target_id}})
                MERGE (a)-[:{rel_type} {{label: $label}}]->(b)
            """, **row)
            count += 1
    return {"imported": count, "status": "ok"}
