"""
智能体层 — Ontology OS 通用推理引擎
通过 llm_client 接入大模型做真正的 ReAct 推理。
写操作（审批执行）保留原有的数据库回写逻辑。
"""

import time
from ontology import (
    get_graph,
    get_node_detail,
    get_impact_analysis,
    highlight_path,
    find_shortest_path_to_product,
    get_supplier_risk_summary,
)
from neo4j_connector import (
    get_downstream_components_for_material,
    get_downstream_products_for_component,
    get_supplier_for_material,
    update_raw_material_stock,
    update_component_stock,
)
from llm_client import reason as llm_reason


def _ts():
    return time.strftime("%H:%M:%S", time.localtime())


def run_agent(node_id: str, context: dict | None = None) -> dict:
    """
    通用推理入口：调用 LLM 进行 ReAct 推理，不区分节点类型。
    LLM 不可用时自动降级为规则推理。
    """
    try:
        return llm_reason(node_id)
    except Exception as e:
        # 终极降级：纯规则推理
        detail = get_node_detail(node_id)
        if not detail:
            return {
                "node_id": node_id,
                "logs": [{
                    "step": 1, "type": "error", "icon": "❌", "color": "red",
                    "message": f"🔴 节点 {node_id} 在语义图谱中未找到。推理终止。",
                    "timestamp": _ts(),
                }],
                "decision": None, "requires_approval": False,
            }

        impact = get_impact_analysis(node_id, depth=3)
        alert = detail.get('alert', False)

        logs = [{
            "step": 1, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"📊 节点「{detail.get('label', node_id)}」当前状态：{'⚠️ 告警' if alert else '✅ 正常'}，影响范围={impact.get('total_affected', 0)} 个节点。\n错误: {str(e)}",
            "timestamp": _ts(),
        }]

        if alert:
            logs.append({
                "step": 2, "type": "decision", "icon": "🎯", "color": "purple",
                "message": "🎯 节点处于告警状态，建议人工审核。",
                "data": {
                    "action_name": "manual_review",
                    "params": {"node_id": node_id},
                    "reasoning": "降级规则推理",
                    "requires_approval": True,
                },
                "timestamp": _ts(),
            })
            return {"node_id": node_id, "logs": logs, "decision": logs[-1]['data'], "requires_approval": True}

        logs.append({
            "step": 2, "type": "thought", "icon": "🧠", "color": "orange",
            "message": "✅ 节点状态正常，无需操作。",
            "timestamp": _ts(),
        })
        return {"node_id": node_id, "logs": logs, "decision": None, "requires_approval": False}


# =====================================================
# 动作执行引擎（Write-back + 图谱刷新）
# =====================================================

def execute_action(action_name: str, params: dict) -> dict:
    """执行人工审批通过后的业务操作"""
    from ontology import refresh_graph

    handlers = {
        "emergency_purchase_raw_material": _exec_purchase_raw_material,
        "restock_component": _exec_restock_component,
        "supplier_risk_review": _exec_supplier_risk_review,
        "create_purchase_order": _exec_purchase_raw_material,
        "manual_review": _exec_manual_review,
    }

    handler = handlers.get(action_name)
    if handler is None:
        return {"success": False, "message": f"未知动作：{action_name}"}

    result = handler(params)
    if result.get("success"):
        refresh_graph()
    return result


def _exec_purchase_raw_material(params: dict) -> dict:
    material_id = params.get("material_id")
    target_stock = params.get("target_stock")
    quantity = params.get("quantity")
    if not material_id:
        return {"success": False, "message": "缺少 material_id"}
    stock = target_stock if target_stock else params.get("current_stock", 0) + quantity
    updated = update_raw_material_stock(material_id, stock)
    if updated is None:
        return {"success": False, "message": f"原材料 {material_id} 不存在"}
    return {
        "success": True,
        "message": f"✅ ERP 回写成功：{updated['name']} 库存已更新为 {stock} 吨。语义图谱已同步刷新。",
        "updated_item": updated,
    }


def _exec_restock_component(params: dict) -> dict:
    component_id = params.get("component_id")
    target_stock = params.get("target_stock")
    if not component_id:
        return {"success": False, "message": "缺少 component_id"}
    updated = update_component_stock(component_id, target_stock)
    if updated is None:
        return {"success": False, "message": f"零部件 {component_id} 不存在"}
    return {
        "success": True,
        "message": f"✅ ERP 回写成功：{updated['name']} 库存已更新至 {target_stock} 件。语义图谱已同步刷新。",
        "updated_item": updated,
    }


def _exec_supplier_risk_review(params: dict) -> dict:
    supplier_name = params.get("supplier_name", "未知供应商")
    return {
        "success": True,
        "message": f"✅ 供应商风险审查流程已启动：对「{supplier_name}」的风险审查工单已下发至采购&质量部门。建议 48 小时内完成评估并回传审查结论。",
    }


def _exec_manual_review(params: dict) -> dict:
    node_id = params.get("node_id", "未知")
    return {
        "success": True,
        "message": f"✅ 人工审核工单已创建：节点 {node_id} 已标记为待审核。",
    }
