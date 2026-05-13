"""
数据导入管道 — CSV/JSON 校验 + Neo4j 写入
"""

from neo4j_connector import (
    get_driver, bulk_import_raw_materials, bulk_import_links,
)
from ontology import refresh_graph

# ============================================================
# 字段别名映射 (CSV 中文列名 → 系统属性名)
# ============================================================

FIELD_ALIASES = {
    "id": ["编号", "id", "ID", "SAP_ID", "Vendor_SAP_ID", "Material_SAP_ID",
           "Component_SAP_ID", "Product_SAP_ID", "Factory_SAP_ID", "Plant_SAP_ID"],
    "name": ["名称", "name", "名字", "物料名称", "产品名称", "供应商名称", "工厂名称", "零件名称",
             "Vendor_Name", "Material_Description", "Component_Description",
             "Product_Description", "Plant_Name", "Sup_Name", "CMP_Description", "Mat_Description"],
    "stock": ["库存", "stock", "库存数量", "当前库存", "Current_Stock", "Current_Stock_Qty",
              "Current_Stock_On_Hand"],
    "status": ["状态", "status", "Operational_Status", "Plant_Status"],
    "headcount": ["人数", "headcount", "在岗人数", "Total_Headcount", "Headcount"],
    "threshold": ["阈值", "threshold", "安全阈值", "安全线",
                  "Safety_Stock_Level", "Safety_Stock", "Reorder_Point"],
    "risk_level": ["风险等级", "riskLevel", "风险评级", "risk_level", "Risk_Category"],
    "on_time_delivery_rate": ["准时率", "onTimeDeliveryRate", "交货准时率", "OnTime_Delivery_Pct"],
    "target_yield": ["目标产能", "targetYield", "目标产量", "Monthly_Target_Yield"],
    "current_yield": ["实际产能", "currentYield", "实际产量", "Monthly_Actual_Yield"],
    "daily_consumption": ["日消耗", "dailyConsumption", "日消耗量", "Avg_Daily_Consumption",
                          "Daily_Usage_Qty", "Avg_Daily_Usage"],
    "defect_rate": ["不良率", "defectRate", "次品率", "Defect_Rate_Pct"],
    "quality_score": ["质检得分", "qualityScore", "质量分", "Quality_Score_Pct"],
    "capacity_utilization": ["产能利用率", "capacityUtilization", "利用率", "Capacity_Util_Pct"],
    "location": ["所在地", "location", "地址", "地点", "Country_Region", "Country_City",
                 "Country", "City", "地区"],
    "contact": ["联系人", "contact", "联系方式", "Contact_Person"],
    "certification": ["认证", "certification", "资质", "证书", "ISO_Certification"],
    "unit": ["单位", "unit", "Base_Unit"],
    "supplier_id": ["供应商ID", "supplierId", "supplier_id", "供应商编号", "Supplier_SAP_ID"],
    "factory_id": ["工厂ID", "factoryId", "factory_id", "工厂编号", "Factory_SAP_ID"],
    "source_id": ["源ID", "sourceId", "source_id", "源节点", "Source_SAP_ID"],
    "target_id": ["目标ID", "targetId", "target_id", "目标节点", "Target_SAP_ID"],
    "link_type": ["关系类型", "linkType", "link_type", "类型", "Relationship_Type"],
    "label": ["标签", "label", "描述", "Relation_Label"],
}

# 构建反向查找表
ALIAS_TO_FIELD = {}
for field, aliases in FIELD_ALIASES.items():
    for alias in aliases:
        ALIAS_TO_FIELD[alias.strip().lower()] = field


def normalize_field_names(rows: list[dict], object_type: str) -> list[dict]:
    """将 CSV 列名映射到系统属性名"""
    normalized = []
    for row in rows:
        new_row = {}
        for key, value in row.items():
            if key is None:
                continue
            field = ALIAS_TO_FIELD.get(key.strip().lower(), key.strip().lower())
            # 跳过空值
            if value is None or value == '':
                continue
            # 类型转换
            if field in ('stock', 'threshold', 'daily_consumption', 'target_yield',
                         'current_yield', 'on_time_delivery_rate', 'capacity_utilization',
                         'defect_rate', 'quality_score'):
                try:
                    value = float(value)
                except ValueError:
                    pass
            new_row[field] = value
        normalized.append(new_row)
    return normalized


# ============================================================
# 数据校验器
# ============================================================

class DataValidator:
    REQUIRED_FIELDS = {
        "RawMaterial": ["id", "name", "stock", "threshold", "supplier_id"],
        "Component": ["id", "name", "stock", "daily_consumption"],
        "FinalProduct": ["id", "name", "target_yield", "current_yield", "factory_id"],
        "Supplier": ["id", "name", "risk_level", "on_time_delivery_rate"],
        "Factory": ["id", "name", "location", "status"],
        "Link": ["source_id", "target_id", "link_type"],
    }

    VALID_VALUES = {
        "risk_level": ["High", "Medium", "Low"],
        "status": ["Running", "Maintenance", "Shutdown"],
        "link_type": ["supplies", "used_in", "assembled_into", "manufactured_at"],
    }

    TYPE_MAP = {
        "raw-materials": "RawMaterial",
        "components": "Component",
        "final-products": "FinalProduct",
        "suppliers": "Supplier",
        "factories": "Factory",
        "links": "Link",
    }

    def validate(self, object_type: str, rows: list[dict]) -> dict:
        obj = self.TYPE_MAP.get(object_type, object_type)
        required = self.REQUIRED_FIELDS.get(obj, [])
        valid = []
        errors = []

        # 获取现有外键引用
        existing_ids = self._get_existing_ids(obj)

        for i, row in enumerate(rows):
            row_errors = []

            # 必填字段检查
            for field in required:
                if field not in row or row[field] is None or row[field] == '':
                    row_errors.append({
                        "row": i + 1, "field": field,
                        "msg": f"缺少必填字段: {field}"
                    })

            # 枚举值检查
            for field, allowed in self.VALID_VALUES.items():
                if field in row and row[field] not in allowed:
                    row_errors.append({
                        "row": i + 1, "field": field,
                        "msg": f"无效值 '{row[field]}'，允许: {allowed}"
                    })

            # 外键引用检查 (仅对非 Link 类型检查引用的 ID 是否存在)
            if obj == "RawMaterial" and "supplier_id" in row:
                sid = row["supplier_id"]
                existing = self._check_id_exists("Supplier", sid)
                if not existing:
                    row_errors.append({
                        "row": i + 1, "field": "supplier_id",
                        "msg": f"供应商 {sid} 不存在，请先导入供应商数据"
                    })
            if obj == "FinalProduct" and "factory_id" in row:
                fid = row["factory_id"]
                existing = self._check_id_exists("Factory", fid)
                if not existing:
                    row_errors.append({
                        "row": i + 1, "field": "factory_id",
                        "msg": f"工厂 {fid} 不存在，请先导入工厂数据"
                    })
            if obj == "Link":
                sid = row.get("source_id", "")
                if sid and not self._check_id_exists(None, sid):
                    row_errors.append({
                        "row": i + 1, "field": "source_id",
                        "msg": f"源节点 {sid} 不存在"
                    })
                tid = row.get("target_id", "")
                if tid and not self._check_id_exists(None, tid):
                    row_errors.append({
                        "row": i + 1, "field": "target_id",
                        "msg": f"目标节点 {tid} 不存在"
                    })

            if row_errors:
                errors.extend(row_errors)
            else:
                valid.append(row)

        return {"valid": valid, "errors": errors}

    def _check_id_exists(self, label: str | None, node_id: str) -> bool:
        """检查指定 ID 的节点是否存在"""
        try:
            driver = get_driver()
            with driver.session() as session:
                if label:
                    result = session.run(
                        f"MATCH (n:`{label}` {{id: $id}}) RETURN count(n) AS c",
                        id=node_id
                    )
                else:
                    result = session.run(
                        "MATCH (n {id: $id}) RETURN count(n) AS c",
                        id=node_id
                    )
                return result.single()["c"] > 0
        except Exception:
            return True  # 连接失败时跳过外键检查

    def _get_existing_ids(self, obj_type: str) -> set:
        try:
            driver = get_driver()
            with driver.session() as session:
                if obj_type != "Link":
                    result = session.run(f"MATCH (n:`{obj_type}`) RETURN n.id AS id")
                else:
                    result = session.run("MATCH (n) RETURN n.id AS id")
                return {r["id"] for r in result}
        except Exception:
            return set()


# ============================================================
# 导入执行
# ============================================================

def import_objects(object_type: str, rows: list[dict]) -> dict:
    """将校验后的数据写入 Neo4j"""
    obj = DataValidator.TYPE_MAP.get(object_type, object_type)

    if obj == "Link":
        result = _import_links(rows)
    else:
        result = _import_nodes(obj, rows)

    if result.get("imported", 0) > 0:
        refresh_graph()
    return result


def _import_nodes(label: str, rows: list[dict]) -> dict:
    """导入节点到 Neo4j (snake_case → camelCase 自动转换)"""

    # 属性名转换表：snake_case → camelCase (匹配 neo4j_connector 查询约定)
    SNAKE_TO_CAMEL = {
        "quality_score": "qualityScore",
        "supplier_id": "supplierId",
        "factory_id": "factoryId",
        "risk_level": "riskLevel",
        "on_time_delivery_rate": "onTimeDeliveryRate",
        "target_yield": "targetYield",
        "current_yield": "currentYield",
        "daily_consumption": "dailyConsumption",
        "defect_rate": "defectRate",
        "defect_pct": "defectRate",
        "capacity_utilization": "capacityUtilization",
        "yield_pct": "yieldRatio",
        "quality_score_pct": "qualityScore",
        "days_remaining": "daysRemaining",
        "headcount": "headcount",
    }

    imported = 0
    errors = []
    try:
        driver = get_driver()
        with driver.session() as session:
            for i, row in enumerate(rows):
                try:
                    node_id = row.pop("id")
                    # snake_case → camelCase 转换
                    for snake_key in list(row.keys()):
                        camel = SNAKE_TO_CAMEL.get(snake_key)
                        if camel:
                            row[camel] = row.pop(snake_key)
                    # 动态构建属性
                    props = ", ".join(f"n.{k} = ${k}" for k in row.keys())
                    query = f"""
                        MERGE (n:`{label}` {{id: $id}})
                        SET {props}
                    """
                    session.run(query, id=node_id, **row)
                    imported += 1
                except Exception as e:
                    errors.append({"row": i + 1, "msg": str(e)})
                finally:
                    row["id"] = node_id  # restore
    except Exception as e:
        return {"imported": 0, "failed": len(rows), "errors": [{"msg": f"数据库连接失败: {e}"}]}

    return {"imported": imported, "failed": len(rows) - imported, "errors": errors}


def _import_links(rows: list[dict]) -> dict:
    """导入链路到 Neo4j"""
    imported = 0
    errors = []
    try:
        driver = get_driver()
        with driver.session() as session:
            for i, row in enumerate(rows):
                try:
                    source_id = row["source_id"]
                    target_id = row["target_id"]
                    link_type = row["link_type"].upper()
                    lbl = row.get("label", "")
                    session.run(f"""
                        MATCH (a {{id: $source_id}})
                        MATCH (b {{id: $target_id}})
                        MERGE (a)-[:`{link_type}` {{label: $label}}]->(b)
                    """, source_id=source_id, target_id=target_id, label=lbl)
                    imported += 1
                except Exception as e:
                    errors.append({"row": i + 1, "msg": str(e)})
    except Exception as e:
        return {"imported": 0, "failed": len(rows), "errors": [{"msg": f"数据库连接失败: {e}"}]}

    return {"imported": imported, "failed": len(rows) - imported, "errors": errors}


# ============================================================
# CSV 解析工具
# ============================================================

def parse_csv(content: bytes) -> list[dict]:
    """解析 CSV 内容为 list[dict]"""
    import csv
    import io
    text = content.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


# ============================================================
# UNWIND 批量导入 (Phase 6)
# ============================================================

def batch_import_nodes(node_type: str, rows: list[dict], mapping: dict, dataset: str = "default") -> dict:
    """UNWIND 批量导入节点"""
    import time
    start = time.time()

    id_col = mapping["idColumn"]
    name_col = mapping.get("nameColumn", id_col)
    props = mapping.get("properties", [])

    # 构建批次
    batch = []
    for row in rows:
        node = {"id": str(row.get(id_col, "")), "name": str(row.get(name_col, "")), "dataset": dataset}
        for prop in props:
            val = row.get(prop["csvColumn"])
            if val is None or val == "":
                continue
            if prop.get("type") == "number":
                try:
                    val = float(val)
                except ValueError:
                    continue
            node[prop["propertyName"]] = val
        if node["id"]:
            batch.append(node)

    # UNWIND 写入 (每 1000 条一批)
    imported = 0
    driver = get_driver()
    for i in range(0, len(batch), 1000):
        chunk = batch[i:i+1000]
        sample_keys = list(chunk[0].keys()) if chunk else []
        set_parts = [f"n.{k} = row.{k}" for k in sample_keys if k not in ("id", "name")]
        set_clause = ", ".join(set_parts) if set_parts else ""

        with driver.session() as session:
            session.run(f"""
                UNWIND $batch AS row
                MERGE (n:`{node_type}` {{id: row.id}})
                SET n.name = row.name{', ' + set_clause if set_clause else ''}
            """, batch=chunk)
            imported += len(chunk)

    return {
        "imported": imported,
        "failed": len(rows) - imported,
        "errors": [],
        "duration_ms": int((time.time() - start) * 1000),
    }


def batch_import_edges(rows: list[dict], mapping: dict) -> dict:
    """UNWIND 批量导入关系"""
    import time
    start = time.time()

    from_col = mapping["fromColumn"]
    to_col = mapping["toColumn"]
    rel_type = mapping["relationshipType"]
    label = mapping.get("label", "")

    batch = []
    for row in rows:
        edge = {
            "source": str(row.get(from_col, "")),
            "target": str(row.get(to_col, "")),
            "label": label,
        }
        if edge["source"] and edge["target"]:
            batch.append(edge)

    imported = 0
    driver = get_driver()
    for i in range(0, len(batch), 1000):
        chunk = batch[i:i+1000]
        with driver.session() as session:
            session.run(f"""
                UNWIND $batch AS row
                MATCH (a {{id: row.source}})
                MATCH (b {{id: row.target}})
                MERGE (a)-[r:`{rel_type}`]->(b)
                SET r.label = row.label
            """, batch=chunk)
            imported += len(chunk)

    return {
        "imported": imported,
        "failed": len(rows) - imported,
        "errors": [],
        "duration_ms": int((time.time() - start) * 1000),
    }


# ============================================================
# 多表关系导入 (Phase 6 重写)
# ============================================================

def batch_import_edges_multi(
    from_rows: list[dict],
    from_id_col: str,
    to_id_col: str,
    rel_type: str,
    label: str = "",
    dataset: str = "default",
) -> dict:
    """
    批量导入关系：从 from_rows 中提取 from_id_col → to_id_col 的映射。
    对于跨表关系，from_rows 中的 to_id_col 就是外键值。
    """
    import time
    start = time.time()

    batch = []
    seen = set()
    for row in from_rows:
        source = str(row.get(from_id_col, "")).strip()
        target = str(row.get(to_id_col, "")).strip()
        if source and target:
            key = f"{source}->{target}"
            if key not in seen:
                seen.add(key)
                batch.append({"source": source, "target": target, "label": label, "dataset": dataset})

    imported = 0
    driver = get_driver()
    for i in range(0, len(batch), 1000):
        chunk = batch[i:i+1000]
        with driver.session() as session:
            session.run(f"""
                UNWIND $batch AS row
                MATCH (a {{id: row.source}})
                MATCH (b {{id: row.target}})
                MERGE (a)-[r:`{rel_type}`]->(b)
                SET r.label = row.label, r.dataset = row.dataset
            """, batch=chunk)
            imported += len(chunk)

    return {
        "imported": imported,
        "failed": len(from_rows) - imported,
        "errors": [],
        "duration_ms": int((time.time() - start) * 1000),
    }
