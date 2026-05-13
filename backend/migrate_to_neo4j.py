"""
数据迁移脚本：SQLite → Neo4j
读取现有 SQLite 数据 → 清空并写入 Neo4j 图数据库
"""

import sys
import os
from neo4j import GraphDatabase

# 确保可以 import 同目录的 database
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    fetch_all_suppliers,
    fetch_all_raw_materials,
    fetch_all_components,
    fetch_all_final_products,
    fetch_all_factories,
    fetch_all_links,
)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_AUTH = (os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", ""))


def get_driver():
    return GraphDatabase.driver(NEO4J_URI, auth=NEO4J_AUTH)


def clear_graph(session):
    """清空 Neo4j 中所有节点和关系"""
    session.run("MATCH (n) DETACH DELETE n")
    print("✓ Neo4j 图已清空")


def import_suppliers(session):
    suppliers = fetch_all_suppliers()
    for s in suppliers:
        session.run(
            """
            CREATE (n:Supplier {
                id: $id, name: $name, riskLevel: $risk_level,
                onTimeDeliveryRate: $on_time, location: $location,
                contact: $contact, certification: $cert
            })
            """,
            id=s["id"],
            name=s["name"],
            risk_level=s["risk_level"],
            on_time=s["on_time_delivery_rate"],
            location=s.get("location", ""),
            contact=s.get("contact", ""),
            cert=s.get("certification", ""),
        )
    print(f"✓ 供应商: {len(suppliers)} 个节点已创建")


def import_raw_materials(session):
    materials = fetch_all_raw_materials()
    for rm in materials:
        stock = rm["stock"]
        threshold = rm["threshold"]
        is_alert = stock < threshold
        session.run(
            """
            CREATE (n:RawMaterial {
                id: $id, name: $name, stock: $stock,
                threshold: $threshold, qualityScore: $quality,
                unit: $unit, supplierId: $supplier_id, alert: $alert
            })
            """,
            id=rm["id"],
            name=rm["name"],
            stock=stock,
            threshold=threshold,
            quality=rm["quality_score"],
            unit=rm.get("unit", "吨"),
            supplier_id=rm.get("supplier_id", ""),
            alert=is_alert,
        )
    print(f"✓ 原材料: {len(materials)} 个节点已创建")


def import_components(session):
    components = fetch_all_components()
    for c in components:
        stock = c["stock"]
        daily = c["daily_consumption"]
        days_remaining = stock / daily if daily > 0 else 0
        is_alert = days_remaining < 3
        session.run(
            """
            CREATE (n:Component {
                id: $id, name: $name, stock: $stock,
                dailyConsumption: $daily, unit: $unit,
                defectRate: $defect, daysRemaining: $days_remaining,
                alert: $alert
            })
            """,
            id=c["id"],
            name=c["name"],
            stock=stock,
            daily=daily,
            unit=c.get("unit", "件"),
            defect=c.get("defect_rate", 0),
            days_remaining=round(days_remaining, 1),
            alert=is_alert,
        )
    print(f"✓ 零部件: {len(components)} 个节点已创建")


def import_final_products(session):
    products = fetch_all_final_products()
    for fp in products:
        target = fp["target_yield"]
        current = fp["current_yield"]
        ratio = current / target if target > 0 else 0
        is_alert = ratio < 0.8
        session.run(
            """
            CREATE (n:FinalProduct {
                id: $id, name: $name, targetYield: $target,
                currentYield: $current, unit: $unit,
                factoryId: $factory_id, yieldRatio: $ratio,
                alert: $alert
            })
            """,
            id=fp["id"],
            name=fp["name"],
            target=target,
            current=current,
            unit=fp.get("unit", "台"),
            factory_id=fp.get("factory_id", ""),
            ratio=round(ratio, 3),
            alert=is_alert,
        )
    print(f"✓ 最终产品: {len(products)} 个节点已创建")


def import_factories(session):
    factories = fetch_all_factories()
    for f in factories:
        session.run(
            """
            CREATE (n:Factory {
                id: $id, name: $name, location: $location,
                status: $status, capacityUtilization: $util,
                headcount: $hc
            })
            """,
            id=f["id"],
            name=f["name"],
            location=f.get("location", ""),
            status=f.get("status", "Running"),
            util=f.get("capacity_utilization", 0),
            hc=f.get("headcount", 0),
        )
    print(f"✓ 工厂: {len(factories)} 个节点已创建")


def import_links(session):
    links = fetch_all_links()
    link_type_map = {
        "supplies": "SUPPLIES",
        "used_in": "USED_IN",
        "assembled_into": "ASSEMBLED_INTO",
        "manufactured_at": "MANUFACTURED_AT",
    }
    count = 0
    for link in links:
        rel_type = link_type_map.get(link["link_type"], link["link_type"].upper())
        session.run(
            f"""
            MATCH (a {{id: $source_id}})
            MATCH (b {{id: $target_id}})
            MERGE (a)-[:{rel_type} {{label: $label}}]->(b)
            """,
            source_id=link["source_id"],
            target_id=link["target_id"],
            label=link.get("label", ""),
        )
        count += 1
    print(f"✓ 语义链路: {count} 条关系已创建")


def migrate():
    """主迁移函数：清空 Neo4j → 写入全部数据"""
    driver = get_driver()
    try:
        driver.verify_connectivity()
        print("✓ Neo4j 连接验证通过")
    except Exception as e:
        print(f"✗ Neo4j 连接失败: {e}")
        print("  请确保 Docker 容器已启动: docker compose up -d")
        return False

    with driver.session() as session:
        clear_graph(session)
        import_suppliers(session)
        import_raw_materials(session)
        import_components(session)
        import_final_products(session)
        import_factories(session)
        import_links(session)

    # 注入 dataset 标签，标记为内置演示数据
    with driver.session() as session:
        session.run("MATCH (n) WHERE n.dataset IS NULL SET n.dataset = 'demo'")
        session.run("MATCH ()-[r]->() WHERE r.dataset IS NULL SET r.dataset = 'demo'")
    print("✅ 已为演示数据注入 dataset='demo' 标签")

    driver.close()
    print("\n✅ 迁移完成：SQLite → Neo4j")
    return True


if __name__ == "__main__":
    migrate()
