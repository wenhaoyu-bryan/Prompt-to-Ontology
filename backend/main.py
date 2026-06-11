"""
工业智能体本体系统 — FastAPI 主入口
提供 RESTful API：图谱数据、节点详情、智能体推理、动作执行、链路分析
"""

import json
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import init_db
from neo4j_connector import get_driver
from ontology import (
    build_graph,
    get_graph_data,
    get_node_detail,
    get_impact_analysis,
    highlight_path,
    find_shortest_path_to_product,
    get_all_alert_nodes,
    get_supplier_risk_summary,
)
from agent import run_agent, execute_action
from legacy_data_pipeline import DataValidator, import_objects, parse_csv, normalize_field_names
from ontology_registry import OntologyRegistry
from domain_config import list_domains, get_domain_config, get_default_domain

app = FastAPI(title="Ontology OS — 企业本体操作系统", version="3.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _auto_import_pet_food(driver):
    """启动时自动导入 Pet Food sample data。"""
    from pathlib import Path
    from domain.petfood_transformer import transform
    from rule_engine import RuleEngine
    from constraint_validator import validate_payload
    from petfood_neo4j import ensure_constraints, write_graph_payload

    sample_dir = Path(__file__).resolve().parent.parent / "sample-data" / "pet-food"
    if not sample_dir.exists():
        print("⚠ sample-data/pet-food 目录不存在，跳过自动导入")
        return

    ensure_constraints(driver)
    payload = transform(sample_dir)
    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)
    payload = engine.apply_rules(payload)

    # 校验
    vr = validate_payload(registry, payload)
    if not vr["valid"]:
        print(f"⚠ Constraint validation failed ({vr['summary']['error_count']} errors), skipping import")
        for e in vr["errors"][:5]:
            print(f"  ❌ {e}")
        return
    if vr["warnings"]:
        print(f"⚠ {vr['summary']['warning_count']} validation warnings")
        for w in vr["warnings"][:5]:
            print(f"  ⚠ {w}")

    result = write_graph_payload(payload, driver)
    print(f"✅ Pet Food 导入完成：{result['nodes_created']} 节点, {result['edges_created']} 边")


@app.on_event("startup")
def startup():
    # 1. 初始化 SQLite 种子数据 (供迁移脚本使用)
    init_db()
    from database import init_ontology_schema_table
    init_ontology_schema_table()

    # 2. 验证 Neo4j 连接
    driver = get_driver()
    driver.verify_connectivity()

    # 3. 从 domain config 读取默认 domain 配置
    domain = get_default_domain()
    config = get_domain_config(domain)
    primary_type = config["primary_object_type"]
    dataset = config["dataset"]

    # 4. 自动导入默认 domain sample data（如果还没有数据）
    with driver.session() as session:
        count = session.run(
            f"MATCH (n:`{primary_type}`) RETURN count(n) AS c"
        ).single()["c"]
    if count == 0:
        print(f"⏳ 自动导入 {config['label']} Demo 数据...")
        if domain == "pet_food":
            _auto_import_pet_food(driver)
    else:
        print(f"✅ {config['label']} 数据已就绪：{count} 个实例")

    # 5. 构建 NetworkX 内存图
    build_graph(dataset)
    print(f"✅ 系统初始化完成：{config['label']} 图谱已构建。")


# ---- 请求体模型 ----
class ChatRequest(BaseModel):
    node_id: str
    context: dict | None = None


class ActionRequest(BaseModel):
    action_name: str
    params: dict


class PathRequest(BaseModel):
    from_id: str
    to_id: str


class MultiNodeRequest(BaseModel):
    node_ids: list[str]


# ---- API 端点 ----

@app.get("/api/health")
def api_health():
    return {"status": "ok", "system": "Ontology OS v3.0 — 企业本体操作系统"}


@app.get("/api/domains")
def api_list_domains():
    """List all registered domains."""
    return list_domains()


@app.get("/api/domains/default")
def api_default_domain():
    """Return the default domain config."""
    key = get_default_domain()
    cfg = get_domain_config(key)
    return {"key": cfg["key"], "label": cfg["label"]}


@app.get("/api/datasets")
def api_list_datasets():
    """列出所有数据集"""
    from neo4j_connector import list_datasets
    return list_datasets()


@app.post("/api/dataset/clear")
def api_clear_dataset(request: dict):
    """清空指定数据集的数据"""
    dataset = request.get("dataset", "")
    if not dataset:
        raise HTTPException(400, "需要指定 dataset")
    if dataset in ("demo", "legacy"):
        raise HTTPException(403, "内置数据集不可删除")
    driver = get_driver()
    with driver.session() as session:
        if dataset == "all":
            session.run("MATCH (n) DETACH DELETE n")
        elif dataset == "legacy":
            session.run("MATCH (n) WHERE n.dataset IS NULL DETACH DELETE n")
        else:
            session.run("MATCH (n {dataset: $ds}) DETACH DELETE n", ds=dataset)
    refresh_graph()
    return {"status": "ok", "cleared": dataset}

@app.get("/api/llm-config")
def api_llm_config_legacy():
    """Legacy endpoint — redirects to /api/llm/config"""
    from llm_config_manager import get_active_status
    return get_active_status()


@app.get("/api/llm/config")
def api_llm_get_config():
    """Return masked LLM config status."""
    from llm_config_manager import get_active_status
    return get_active_status()


class LLMConfigRequest(BaseModel):
    provider: str
    api_key: str
    model: str
    base_url: str = ""


@app.post("/api/llm/config")
def api_llm_set_config(req: LLMConfigRequest):
    """Save runtime LLM config. Key stored in memory only."""
    from llm_config_manager import set_runtime_llm_config
    try:
        result = set_runtime_llm_config(req.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/llm/config")
def api_llm_delete_config():
    """Clear runtime LLM config."""
    from llm_config_manager import clear_runtime_llm_config
    return clear_runtime_llm_config()


class LLMTestRequest(BaseModel):
    provider: str = ""
    api_key: str = ""
    model: str = ""
    base_url: str = ""


@app.post("/api/llm/test")
def api_llm_test(req: LLMTestRequest | None = None):
    """Test LLM connection."""
    from llm_config_manager import test_llm_connection
    config = req.model_dump() if req and req.api_key else None
    result = test_llm_connection(config)
    return result


@app.get("/api/graph")
def api_get_graph(dataset: str | None = None):
    """返回 {nodes, links} 供 D3 渲染，支持 ?dataset=xxx 过滤"""
    return get_graph_data(dataset)


@app.get("/api/node/{node_id}")
def api_get_node(node_id: str):
    """返回特定实体的完整属性和拓扑关联（Object 360° 视图）"""
    detail = get_node_detail(node_id)
    if detail is None:
        return {"error": f"节点 {node_id} 未找到"}
    return detail


@app.post("/api/chat")
def api_chat(req: ChatRequest):
    """
    触发智能体推理闭环。
    根据节点类型自动分流到不同的分析链。
    返回结构化推理日志 + 决策信息（含 HITL 审批标记）。
    """
    result = run_agent(req.node_id, req.context)
    return result


@app.post("/api/action")
def api_action(req: ActionRequest):
    """
    执行人工审批通过的业务操作。
    包含 SQLite Write-back + NetworkX 图谱同步刷新。
    """
    result = execute_action(req.action_name, req.params)
    return result


@app.get("/api/impact-analysis/{node_id}")
def api_impact_analysis(node_id: str, depth: int = 3):
    """影响分析：找出从某节点出发的下游受影响范围"""
    return get_impact_analysis(node_id, depth)

@app.get("/api/blast-radius/{node_id}")
def api_blast_radius_legacy(node_id: str, depth: int = 3):
    """已废弃 → /api/impact-analysis/"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"/api/impact-analysis/{node_id}?depth={depth}", status_code=301)


@app.get("/api/highlight-path/{node_id}")
def api_highlight_path(node_id: str):
    """路径高亮：返回某节点的上下游节点 ID 集合"""
    return highlight_path(node_id)


@app.post("/api/shortest-path")
def api_shortest_path(req: PathRequest):
    """查找从 A 到 B 的最短路径"""
    return find_shortest_path_to_product(req.from_id, req.to_id)


@app.get("/api/alerts")
def api_alerts():
    """返回所有处于告警状态的节点"""
    return get_all_alert_nodes()


@app.get("/api/supplier-risk-summary")
def api_supplier_risk_summary():
    """供应商风险概览（按风险排序）"""
    return get_supplier_risk_summary()


@app.post("/api/multi-node-analyze")
def api_multi_node_analyze(req: MultiNodeRequest):
    """多节点联合分析：同时触发多个节点的智能体推理"""
    results = []
    for nid in req.node_ids:
        result = run_agent(nid)
        results.append(result)
    return {"results": results}


# =====================================================
# 数据导入 API
# =====================================================


@app.post("/api/data/import/preview")
async def api_preview_import(file: UploadFile = File(...)):
    """预览导入：解析 + 校验，不写入。返回前 10 行 + 校验结果"""
    if not (file.filename.endswith('.csv') or file.filename.endswith('.json')):
        raise HTTPException(400, "仅支持 CSV 和 JSON 格式")

    content = await file.read()
    if file.filename.endswith('.csv'):
        rows = parse_csv(content)
    else:
        rows = json.loads(content)

    # 尝试推断对象类型 (从文件名或字段猜测)
    object_type = _guess_object_type(file.filename, rows)

    rows = normalize_field_names(rows, object_type)
    validator = DataValidator()
    result = validator.validate(object_type, rows)

    return {
        "filename": file.filename,
        "object_type": object_type,
        "total_rows": len(rows),
        "preview": rows[:10],
        "valid_count": len(result["valid"]),
        "error_count": len(result["errors"]),
        "errors": result["errors"],
    }


@app.post("/api/data/import/{object_type}")
async def api_import_data(object_type: str, file: UploadFile = File(...)):
    """导入数据到 Neo4j"""
    if not (file.filename.endswith('.csv') or file.filename.endswith('.json')):
        raise HTTPException(400, "仅支持 CSV 和 JSON 格式")

    content = await file.read()
    if file.filename.endswith('.csv'):
        rows = parse_csv(content)
    else:
        rows = json.loads(content)

    rows = normalize_field_names(rows, object_type)
    validator = DataValidator()
    result = validator.validate(object_type, rows)

    # 即使有校验错误，仍导入有效行
    import_result = {"imported": 0, "failed": 0, "errors": []}
    if result["valid"]:
        import_result = import_objects(object_type, result["valid"])

    import_result["status"] = "success" if import_result.get("imported", 0) > 0 else (
        "validation_failed" if result["errors"] else "failed"
    )
    import_result["total_rows"] = len(rows)
    import_result["valid_count"] = len(result["valid"])
    import_result["error_count"] = len(result["errors"])
    import_result["validation_errors"] = result["errors"]
    return import_result


@app.get("/api/data/export/{object_type}")
async def api_export_data(object_type: str):
    """导出 Neo4j 数据为 JSON"""
    table_map = {
        "raw-materials": "RawMaterial", "components": "Component",
        "final-products": "FinalProduct", "suppliers": "Supplier",
        "factories": "Factory",
    }

    try:
        driver = get_driver()
        if object_type == "links":
            with driver.session() as session:
                result = session.run("""
                    MATCH (a)-[r]->(b)
                    RETURN a.id AS source_id, b.id AS target_id,
                           type(r) AS link_type, r.label AS label
                """)
                rows = [r.data() for r in result]
        else:
            label = table_map.get(object_type, object_type)
            with driver.session() as session:
                result = session.run(f"MATCH (n:`{label}`) RETURN n")
                rows = [dict(r["n"]) for r in result]

        return {"object_type": object_type, "count": len(rows), "data": rows}
    except Exception as e:
        raise HTTPException(500, f"导出失败: {e}")


# =====================================================
# 通用导入端点 (Phase 5.4 — 两个 CSV 导入任意行业)
# =====================================================

@app.post("/api/data/import/nodes")
async def api_import_nodes(file: UploadFile = File(...)):
    """通用节点导入：Node_ID + Node_Label + Node_Type + 任意属性列"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(400, "仅支持 CSV 格式")

    content = await file.read()
    rows = parse_csv(content)

    if not rows:
        raise HTTPException(400, "CSV 为空")

    imported = 0
    errors = []

    try:
        driver = get_driver()
        with driver.session() as session:
            for i, row in enumerate(rows):
                try:
                    node_id = row.pop('Node_ID', row.pop('id', row.pop('SAP_ID', None)))
                    node_name = row.pop('Node_Label', row.pop('name', row.pop('Name', node_id)))
                    node_type = row.pop('Node_Type', row.pop('type', row.pop('Type', 'Entity')))

                    if not node_id:
                        errors.append({"row": i + 1, "msg": "缺少 Node_ID"})
                        continue

                    # 清理属性名：去空格、替换特殊字符
                    props = {}
                    for k, v in row.items():
                        if v is None or v == '':
                            continue
                        clean_key = k.strip().replace(' ', '_').replace('-', '_')
                        try:
                            v = float(v)
                        except ValueError:
                            pass
                        props[clean_key] = v

                    # MERGE 节点
                    props_str = ", ".join(f"n.`{k}` = ${k}" for k in props.keys())
                    set_clause = f"SET {props_str}" if props_str else ""
                    session.run(
                        f"MERGE (n:`{node_type}` {{id: $id}}) SET n.name = $name {', ' + set_clause if set_clause else ''}",
                        id=node_id, name=node_name, **props,
                    )
                    imported += 1
                except Exception as e:
                    errors.append({"row": i + 1, "msg": str(e)})
    except Exception as e:
        return {"status": "error", "imported": 0, "errors": [{"msg": str(e)}]}

    from ontology import refresh_graph
    if imported > 0:
        refresh_graph()

    return {"status": "success" if imported > 0 else "failed", "imported": imported, "errors": errors}


@app.post("/api/data/import/edges")
async def api_import_edges(file: UploadFile = File(...)):
    """通用关系导入：Source_Node_ID + Target_Node_ID + Relationship_Type + 任意属性"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(400, "仅支持 CSV 格式")

    content = await file.read()
    rows = parse_csv(content)

    if not rows:
        raise HTTPException(400, "CSV 为空")

    imported = 0
    errors = []

    try:
        driver = get_driver()
        with driver.session() as session:
            for i, row in enumerate(rows):
                try:
                    source = row.pop('Source_Node_ID', row.pop('source_id', None))
                    target = row.pop('Target_Node_ID', row.pop('target_id', None))
                    rel_type = row.pop('Relationship_Type', row.pop('link_type', row.pop('type', None)))

                    if not source or not target or not rel_type:
                        errors.append({"row": i + 1, "msg": "缺少 Source_Node_ID / Target_Node_ID / Relationship_Type"})
                        continue

                    # 清理属性
                    props = {}
                    for k, v in row.items():
                        if v is None or v == '':
                            continue
                        clean_key = k.strip().replace(' ', '_').replace('-', '_')
                        try:
                            v = float(v)
                        except ValueError:
                            pass
                        props[clean_key] = v

                    # 动态属性
                    props_str = ", ".join(f"r.`{k}` = ${k}" for k in props.keys())
                    set_clause = f"SET {props_str}" if props_str else ""

                    session.run(f"""
                        MATCH (a {{id: $source}})
                        MATCH (b {{id: $target}})
                        MERGE (a)-[r:`{rel_type}`]->(b)
                        {set_clause}
                    """, source=source, target=target, **props)
                    imported += 1
                except Exception as e:
                    errors.append({"row": i + 1, "msg": str(e)})
    except Exception as e:
        return {"status": "error", "imported": 0, "errors": [{"msg": str(e)}]}

    from ontology import refresh_graph
    if imported > 0:
        refresh_graph()

    return {"status": "success" if imported > 0 else "failed", "imported": imported, "errors": errors}


def _guess_object_type(filename: str, rows: list[dict]) -> str:
    """从文件名或字段推断对象类型"""
    name = filename.lower()
    if "raw" in name or "material" in name: return "raw-materials"
    if "component" in name or "零件" in name: return "components"
    if "product" in name or "产品" in name or "final" in name: return "final-products"
    if "supplier" in name or "供应商" in name: return "suppliers"
    if "factor" in name or "工厂" in name: return "factories"
    if "link" in name or "relation" in name or "边" in name: return "links"

    # 从字段猜测
    if rows:
        first = rows[0]
        if "risk_level" in first or "riskLevel" in first or "准时率" in first:
            return "suppliers"
        if "link_type" in first or "source_id" in first:
            return "links"

    return "raw-materials"



# =====================================================
# 数据流水线 API (Phase 6)
# =====================================================

@app.post("/api/pipeline/infer-schema")
async def api_infer_schema(request: dict):
    """AI 推断 CSV 数据的本体映射关系（单表兼容）"""
    from llm_client import infer_schema

    filename = request.get("filename", "")
    headers = request.get("headers", [])
    rows = request.get("rows", [])

    if not headers:
        raise HTTPException(400, "缺少 headers")

    result = infer_schema(filename, headers, rows)
    return result


class TableMeta(BaseModel):
    """一张表的元数据"""
    filename: str
    tableDescription: str = ""
    fields: list[dict] = []
    sampleRows: list[dict] = []


class MultiInferRequest(BaseModel):
    """多表联合推断请求"""
    tables: list[TableMeta]


@app.post("/api/pipeline/infer-schema-multi")
async def api_infer_schema_multi(req: MultiInferRequest):
    """多表联合推断：分析所有表的元数据，输出全局 MappingSchema"""
    from llm_client import infer_schema_multi

    if not req.tables:
        raise HTTPException(400, "至少需要一张表")

    result = infer_schema_multi([t.dict() for t in req.tables])
    return result


class TableImportData(BaseModel):
    """一张表的导入数据"""
    filename: str
    nodeType: str
    idColumn: str
    nameColumn: str = ""
    properties: list[dict] = []
    rows: list[dict] = []


class MultiBatchImportRequest(BaseModel):
    """多表批量导入请求"""
    tables: list[TableImportData] = []
    relationships: list[dict] = []
    dataset: str = "default"


@app.post("/api/pipeline/batch-import")
async def api_batch_import(req: MultiBatchImportRequest):
    """多表 UNWIND 批量导入"""
    from legacy_data_pipeline import batch_import_nodes as _batch_nodes, batch_import_edges_multi
    from ontology import refresh_graph

    results = {"nodes": {}, "edges": {}, "total_imported": 0, "total_duration_ms": 0}

    # 1. 先导入所有节点
    for table in req.tables:
        mapping = {
            "idColumn": table.idColumn,
            "nameColumn": table.nameColumn or table.idColumn,
            "properties": table.properties,
        }
        r = _batch_nodes(table.nodeType, table.rows, mapping, dataset=req.dataset)
        results["nodes"][table.nodeType] = r
        results["total_imported"] += r["imported"]
        results["total_duration_ms"] += r["duration_ms"]

    # 2. 再导入所有关系（节点必须先存在）
    for rel in req.relationships:
        from_table = next((t for t in req.tables if t.filename == rel.get("fromTable")), None)
        to_table = next((t for t in req.tables if t.filename == rel.get("toTable")), None)
        if not from_table or not to_table:
            continue

        r = batch_import_edges_multi(
            from_rows=from_table.rows,
            from_id_col=rel["fromColumn"],
            to_id_col=rel["toColumn"],
            rel_type=rel["relationshipType"],
            label=rel.get("label", ""),
            dataset=req.dataset,
        )
        key = f"{from_table.nodeType}->{to_table.nodeType}"
        results["edges"][key] = r
        results["total_imported"] += r["imported"]
        results["total_duration_ms"] += r["duration_ms"]

    refresh_graph()
    results["status"] = "success"
    return results


# =====================================================
# 本体 Schema API (Phase 8)
# =====================================================

@app.get("/api/ontology/schema")
def api_ontology_schema(dataset: str | None = None):
    """从 Neo4j 数据自动提取本体 Schema"""
    driver = get_driver()
    schema: dict = {"classes": [], "relationships": [], "stats": {}}

    with driver.session() as session:
        ds_filter = "WHERE n.dataset = $ds" if dataset and dataset != "all" else ""
        ds_params: dict = {"ds": dataset} if dataset and dataset != "all" else {}

        # 1. 提取所有类（Label）及其属性统计
        labels_result = session.run("CALL db.labels()")
        labels = [r["label"] for r in labels_result]

        for label in labels:
            count = session.run(
                f"MATCH (n:`{label}`) {ds_filter} RETURN count(n) AS cnt",
                **ds_params
            ).single()["cnt"]
            if count == 0:
                continue

            sample = session.run(
                f"MATCH (n:`{label}`) {ds_filter} RETURN n LIMIT 100",
                **ds_params
            )

            prop_stats: dict = {}
            for record in sample:
                node = dict(record["n"])
                for key, value in node.items():
                    if key in ("id", "name", "dataset", "label"):
                        continue
                    if key not in prop_stats:
                        prop_stats[key] = {"types": set(), "count": 0, "samples": [], "null_count": 0}
                    prop_stats[key]["count"] += 1
                    if value is not None:
                        prop_stats[key]["types"].add(type(value).__name__)
                        if len(prop_stats[key]["samples"]) < 3:
                            prop_stats[key]["samples"].append(str(value)[:50])

            properties = []
            for prop_name, stats in prop_stats.items():
                main_type = "string"
                types = stats["types"]
                if "float" in types or "int" in types:
                    main_type = "number"
                elif "bool" in types:
                    main_type = "boolean"
                properties.append({
                    "name": prop_name,
                    "type": main_type,
                    "coverage": round(stats["count"] / count * 100, 1) if count > 0 else 0,
                    "samples": stats["samples"],
                })
            properties.sort(key=lambda p: -p["coverage"])

            schema["classes"].append({
                "name": label,
                "count": count,
                "properties": properties,
                "dataset": dataset or "all",
            })

        # 2. 提取所有关系类型
        rel_types_result = session.run("CALL db.relationshipTypes()")
        rel_types = [r["relationshipType"] for r in rel_types_result]

        for rel_type in rel_types:
            pattern = session.run(f"""
                MATCH (a)-[r:`{rel_type}`]->(b)
                WITH labels(a)[0] AS fromLabel, labels(b)[0] AS toLabel, count(r) AS cnt
                RETURN fromLabel, toLabel, cnt
                ORDER BY cnt DESC
            """)

            patterns = []
            total_count = 0
            for p in pattern:
                patterns.append({"from": p["fromLabel"], "to": p["toLabel"], "count": p["cnt"]})
                total_count += p["cnt"]

            if total_count == 0:
                continue

            cardinality = "N:M"
            if len(patterns) == 1:
                from_distinct = session.run(
                    f"MATCH (a)-[r:`{rel_type}`]->(b) RETURN count(DISTINCT a.id) AS cnt"
                ).single()["cnt"]
                to_distinct = session.run(
                    f"MATCH (a)-[r:`{rel_type}`]->(b) RETURN count(DISTINCT b.id) AS cnt"
                ).single()["cnt"]
                if from_distinct == total_count and to_distinct < total_count:
                    cardinality = "1:N"
                elif to_distinct == total_count and from_distinct < total_count:
                    cardinality = "N:1"
                elif from_distinct == total_count and to_distinct == total_count:
                    cardinality = "1:1"

            schema["relationships"].append({
                "type": rel_type,
                "count": total_count,
                "patterns": patterns,
                "cardinality": cardinality,
            })

        # 3. 全局统计
        total_nodes = session.run("MATCH (n) RETURN count(n) AS cnt").single()["cnt"]
        total_rels = session.run("MATCH ()-[r]->() RETURN count(r) AS cnt").single()["cnt"]
        schema["stats"] = {
            "totalNodes": total_nodes,
            "totalRelationships": total_rels,
            "classCount": len(schema["classes"]),
            "relationshipTypeCount": len(schema["relationships"]),
        }

    return schema


@app.get("/api/ontology/{domain}/schema")
def api_ontology_domain_schema(domain: str):
    """从 YAML 配置加载指定 domain 的完整 ontology schema"""
    try:
        registry = OntologyRegistry(domain=domain)
        schema_data = registry.get_schema()

        # Augment with Ontology Kernel v2 metadata
        try:
            from ontology_kernel import load_ontology_schema, get_schema_summary
            from pathlib import Path
            ontology_path = str(Path(__file__).resolve().parent.parent / "ontology" / domain)
            kernel_schema = load_ontology_schema(domain, ontology_path)
            summary = get_schema_summary(kernel_schema)
            schema_data["schema_version"] = summary["schema_version"]
            schema_data["schema_hash"] = summary["schema_hash"]
            schema_data["normalized_summary"] = summary
        except Exception:
            pass  # Kernel is optional — don't break existing behavior

        return schema_data
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to load ontology for domain '{domain}': {e}")


@app.get("/api/ontology/violations")
def api_ontology_violations(dataset: str | None = None):
    """检查数据中的约束违反"""
    from database import get_constraints

    constraints = get_constraints()
    if not constraints:
        return {"violations": [], "checked": 0}

    driver = get_driver()
    violations = []

    with driver.session() as session:
        for c in constraints:
            if c["constraint_type"] == "required":
                result = session.run(
                    f"MATCH (n:`{c['class_name']}`) "
                    f"WHERE n.{c['property_name']} IS NULL OR n.{c['property_name']} = '' "
                    f"RETURN n.id AS id, n.name AS name LIMIT 20"
                )
                for r in result:
                    violations.append({
                        "class": c["class_name"],
                        "nodeId": r["id"],
                        "nodeName": r["name"],
                        "constraint": c["rule"],
                        "message": c["message"] or f"缺少必填属性 {c['property_name']}",
                    })

            elif c["constraint_type"] == "range":
                result = session.run(
                    f"MATCH (n:`{c['class_name']}`) "
                    f"WHERE NOT (n.{c['property_name']} {c['rule']}) "
                    f"RETURN n.id AS id, n.name AS name, n.{c['property_name']} AS val LIMIT 20"
                )
                for r in result:
                    violations.append({
                        "class": c["class_name"],
                        "nodeId": r["id"],
                        "nodeName": r["name"],
                        "value": r["val"],
                        "constraint": c["rule"],
                        "message": c["message"] or f"{c['property_name']} 违反约束: {c['rule']}",
                    })

    return {"violations": violations, "checked": len(constraints)}


@app.get("/api/ontology/constraints")
def api_get_constraints(class_name: str | None = None):
    from database import get_constraints
    return get_constraints(class_name)


@app.post("/api/ontology/constraints")
def api_add_constraint(req: dict):
    from database import add_constraint
    add_constraint(
        req["className"], req["constraintType"],
        req.get("propertyName", ""), req["rule"], req.get("message", "")
    )
    return {"status": "ok"}


@app.delete("/api/ontology/constraints/{constraint_id}")
def api_delete_constraint(constraint_id: int):
    from database import delete_constraint
    delete_constraint(constraint_id)
    return {"status": "ok"}


# =====================================================
# Pet Food Ontology API (Phase 4-6)
# =====================================================


@app.post("/api/pet-food/import-sample")
@app.post("/api/pet-food/demo/reset-and-import")
def api_pet_food_import_sample():
    """
    一键导入 Pet Food sample data:
    清除旧数据 → 读取 CSV → transform → apply rules → 写入 Neo4j
    """
    from pathlib import Path
    from domain.petfood_transformer import transform, summarize
    from rule_engine import RuleEngine
    from petfood_neo4j import ensure_constraints, clear_pet_food_data, write_graph_payload

    sample_dir = Path(__file__).resolve().parent.parent / "sample-data" / "pet-food"
    if not sample_dir.exists():
        raise HTTPException(404, f"Sample data directory not found: {sample_dir}")

    driver = get_driver()

    try:
        # 1. 确保约束存在
        ensure_constraints(driver)

        # 2. 清除旧的 pet_food 数据
        clear_pet_food_data(driver)

        # 3. Transform CSV → graph payload
        payload = transform(sample_dir)

        # 4. Apply rules → 生成 TRIGGERS_RISK 边
        registry = OntologyRegistry("pet_food")
        engine = RuleEngine(registry)
        payload = engine.apply_rules(payload)

        # 4.5 校验
        from constraint_validator import validate_payload
        vr = validate_payload(registry, payload)
        if not vr["valid"]:
            return {
                "status": "validation_failed",
                "errors": vr["errors"],
                "warnings": vr["warnings"],
                "summary": vr["summary"],
            }

        # 5. 写入 Neo4j
        result = write_graph_payload(payload, driver)

        # 6. 刷新内存图谱
        from ontology import refresh_graph
        refresh_graph()

        # 7. 统计
        stats = summarize(payload)
        trigger_count = len([e for e in payload["edges"] if e["type"] == "TRIGGERS_RISK"])

        resp = {
            "status": "success",
            "nodes_created_or_merged": result["nodes_created"],
            "edges_created_or_merged": result["edges_created"],
            "label_counts": result["label_counts"],
            "relationship_counts": result["relationship_counts"],
            "triggered_risk_count": trigger_count,
            "validation_warnings": vr["warnings"],
            "sample_questions": [
                "这款猫粮为什么有风险？",
                "哪些产品含 chicken？",
                "哪些猫粮没有 taurine？",
                "哪些 senior cat 产品磷含量较高？",
                "帮我比较两款猫粮的风险差异。",
            ],
        }
        return resp
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Pet food import failed: {e}")


@app.get("/api/pet-food/products/{product_id}/risk-explanation")
def api_pet_food_risk_explanation(product_id: str):
    """
    查询某 PetFoodProduct 的完整风险解释。
    返回：产品信息、品牌、成分列表、触发的风险规则详情。
    """
    driver = get_driver()

    with driver.session() as session:
        # 1. 查询产品节点
        product_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid}) RETURN p",
            pid=product_id,
        )
        product_record = product_result.single()
        if not product_record:
            raise HTTPException(404, f"Product '{product_id}' not found")
        product = dict(product_record["p"])

        # 2. 查询品牌
        brand_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[:MADE_BY]->(b:Brand) RETURN b",
            pid=product_id,
        )
        brand_record = brand_result.single()
        brand = dict(brand_record["b"]) if brand_record else {}

        # 3. 查询成分列表
        ingredients_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[c:CONTAINS]->(i:Ingredient) "
            "RETURN i, c.ingredient_order AS ingredient_order "
            "ORDER BY ingredient_order",
            pid=product_id,
        )
        ingredients = []
        for r in ingredients_result:
            ing = dict(r["i"])
            ing["ingredient_order"] = r["ingredient_order"]
            ingredients.append(ing)

        # 4. 查询触发的风险规则
        risks_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[e:TRIGGERS_RISK]->(r:RiskRule) "
            "RETURN r, e.severity AS severity, e.evidence AS evidence, e.reason AS reason",
            pid=product_id,
        )
        risks = []
        for r in risks_result:
            rule = dict(r["r"])
            risks.append({
                "rule_id": rule.get("rule_id"),
                "rule_name": rule.get("rule_name"),
                "severity": r["severity"],
                "evidence": r["evidence"],
                "reason": r["reason"],
                "explanation": rule.get("explanation"),
            })

    return {
        "product": product,
        "brand": brand,
        "ingredients": ingredients,
        "risks": risks,
    }


@app.get("/api/pet-food/products/{product_id}/rule-evaluations")
def api_pet_food_rule_evaluations(product_id: str):
    """
    查询某产品的完整规则评估状态（triggered / passed / not_evaluable / not_applicable）。
    """
    from rule_engine import RuleEngine
    from domain.petfood_transformer import transform

    driver = get_driver()

    with driver.session() as session:
        product_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid}) RETURN p",
            pid=product_id,
        )
        product_record = product_result.single()
        if not product_record:
            raise HTTPException(404, f"Product '{product_id}' not found")
        product = dict(product_record["p"])

        ingredients_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[c:CONTAINS]->(i:Ingredient) "
            "RETURN i.ingredient_name AS name",
            pid=product_id,
        )
        ingredient_names = [
            (r["name"] or "").lower().strip() for r in ingredients_result
        ]

    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)
    evaluations = engine.evaluate_product_full(product, ingredient_names)

    return {
        "product_id": product_id,
        "evaluations": evaluations,
    }


class PetFoodChatRequest(BaseModel):
    question: str
    context: dict | None = None


@app.post("/api/pet-food/agent/chat")
def api_pet_food_agent_chat(req: PetFoodChatRequest):
    """
    Pet Food Agent 聊天接口。
    接收自然语言问题，基于图谱证据链返回结构化回答。
    支持 LLM tool-calling（v2）+ deterministic fallback。
    """
    from petfood_agent_v2 import chat as chat_v2
    from petfood_agent import chat as chat_v1

    if not req.question.strip():
        raise HTTPException(400, "问题不能为空")

    try:
        result = chat_v2(req.question, context=req.context)
        return result
    except Exception:
        # Fallback to v1
        try:
            result = chat_v1(req.question)
            result["tools_used"] = []
            result["llm_used"] = False
            return result
        except Exception as e:
            raise HTTPException(500, f"Agent error: {e}")


# ── Data Pipeline API ───────────────────────────────────────────────────

# Phase 28 uses in-memory storage. Future phases can persist pipeline runs.
from data_pipeline import PipelineService
pipeline_service = PipelineService()

@app.get("/api/pipeline/samples")
def api_pipeline_samples():
    """List available built-in sample data sources."""
    return {"samples": pipeline_service.list_sample_sources()}

@app.post("/api/pipeline/profile/sample")
def api_pipeline_profile_sample(body: dict):
    """Profile a built-in sample data source."""
    sample_name = body.get("sample_name", "")
    if not sample_name:
        raise HTTPException(400, "sample_name is required")
    try:
        profile = pipeline_service.profile_sample(sample_name)
        return profile.model_dump()
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(404, str(e))

@app.post("/api/pipeline/profile/csv")
def api_pipeline_profile_csv(body: dict):
    """Profile CSV content."""
    filename = body.get("filename", "upload.csv")
    content = body.get("content", "")
    if not content:
        raise HTTPException(400, "content is required")
    profile = pipeline_service.profile_csv_content(filename, content)
    return profile.model_dump()

@app.get("/api/pipeline/profile/{source_id}")
def api_pipeline_get_profile(source_id: str):
    """Get a profiled data source."""
    profile = pipeline_service.get_profile(source_id)
    if not profile:
        raise HTTPException(404, f"Profile not found: {source_id}")
    return profile.model_dump()

@app.post("/api/pipeline/mappings/suggest")
def api_pipeline_suggest_mappings(body: dict):
    """Suggest field mappings for a profiled source."""
    source_id = body.get("source_id", "")
    domain = body.get("domain", "pet_food")
    if not source_id:
        raise HTTPException(400, "source_id is required")
    try:
        return pipeline_service.suggest_mappings(source_id, domain)
    except ValueError as e:
        raise HTTPException(404, str(e))

@app.post("/api/pipeline/import-plan")
def api_pipeline_create_import_plan(body: dict):
    """Create an import plan from a profiled source."""
    source_id = body.get("source_id", "")
    domain = body.get("domain", "pet_food")
    object_mappings = body.get("object_mappings")
    link_mappings = body.get("link_mappings")
    if not source_id:
        raise HTTPException(400, "source_id is required")
    try:
        plan = pipeline_service.create_import_plan(source_id, domain, object_mappings, link_mappings)
        return plan.model_dump()
    except ValueError as e:
        raise HTTPException(404, str(e))

@app.get("/api/pipeline/import-plan/{plan_id}")
def api_pipeline_get_import_plan(plan_id: str):
    """Get an import plan by ID."""
    plan = pipeline_service.get_import_plan(plan_id)
    if not plan:
        raise HTTPException(404, f"Import plan not found: {plan_id}")
    return plan.model_dump()

@app.get("/api/pipeline/import-plans")
def api_pipeline_list_import_plans():
    """List all import plans."""
    plans = pipeline_service.list_import_plans()
    return {"plans": [p.model_dump() for p in plans]}


# ── Review Queue API ──────────────────────────────────────────────────────

from review_queue import (
    ReviewDecision,
    submit_import_plan_to_review,
    list_review_items,
    get_review_item,
    approve_review_item,
    reject_review_item,
    apply_review_item,
    apply_approved_batch,
    get_review_summary,
    list_review_batches,
    get_review_batch,
    set_pipeline_service,
)

# Wire pipeline service into review queue
set_pipeline_service(pipeline_service)


@app.post("/api/review/from-import-plan/{plan_id}")
def api_review_submit_plan(plan_id: str):
    """Submit an ImportPlan to the review queue."""
    try:
        batch = submit_import_plan_to_review(plan_id)
        # Store review linkage on the import plan
        pipeline_service.mark_plan_submitted_to_review(plan_id, batch.id)
        items = list_review_items(batch_id=batch.id)
        return {
            "batch": batch.model_dump(),
            "items_created": len(items),
            "item_ids": [i.id for i in items],
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/review/items")
def api_review_list_items(
    status: str | None = None,
    source: str | None = None,
    batch_id: str | None = None,
    type: str | None = None,
):
    """List review items with optional filters."""
    items = list_review_items(status=status, source=source, batch_id=batch_id, type=type)
    return {"items": [i.model_dump() for i in items]}


@app.get("/api/review/items/{item_id}")
def api_review_get_item(item_id: str):
    """Get a single review item."""
    item = get_review_item(item_id)
    if item is None:
        raise HTTPException(404, f"Review item not found: {item_id}")
    return item.model_dump()


@app.post("/api/review/items/{item_id}/approve")
def api_review_approve(item_id: str, body: dict):
    """Approve a pending review item."""
    try:
        decision = ReviewDecision(
            decision="approve",
            reason=body.get("reason", ""),
            reviewed_by=body.get("reviewed_by", "demo_user"),
        )
        item = approve_review_item(item_id, decision)
        return item.model_dump()
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/review/items/{item_id}/reject")
def api_review_reject(item_id: str, body: dict):
    """Reject a pending review item."""
    try:
        decision = ReviewDecision(
            decision="reject",
            reason=body.get("reason", ""),
            reviewed_by=body.get("reviewed_by", "demo_user"),
        )
        item = reject_review_item(item_id, decision)
        return item.model_dump()
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/review/items/{item_id}/apply")
def api_review_apply(item_id: str):
    """Apply an approved review item to the graph."""
    try:
        result = apply_review_item(item_id)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/review/batches")
def api_review_list_batches():
    """List all review batches."""
    batches = list_review_batches()
    return {"batches": [b.model_dump() for b in batches]}


@app.get("/api/review/batches/{batch_id}")
def api_review_get_batch(batch_id: str):
    """Get a single review batch."""
    batch = get_review_batch(batch_id)
    if batch is None:
        raise HTTPException(404, f"Review batch not found: {batch_id}")
    return batch.model_dump()


@app.post("/api/review/batches/{batch_id}/apply-approved")
def api_review_apply_batch(batch_id: str):
    """Apply all approved items in a batch."""
    try:
        results = apply_approved_batch(batch_id)
        return {"results": [r.model_dump() for r in results]}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/review/summary")
def api_review_summary():
    """Get review queue summary statistics."""
    return get_review_summary().model_dump()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
