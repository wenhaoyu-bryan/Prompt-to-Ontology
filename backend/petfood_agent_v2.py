"""
Pet Food Agent v2 — LLM tool-calling with deterministic fallback.

Architecture:
  LLM planner → tool execution → LLM grounded answer
  Fallback: keyword router → tool execution → template answer

Safety: no veterinary diagnosis, no fabricated data, always includes limitations.
"""

import os
import re
import json
import time
from neo4j_connector import get_driver
from rule_engine import RuleEngine
from ontology_registry import OntologyRegistry

# =====================================================
# System Prompt
# =====================================================

AGENT_SYSTEM_PROMPT = """You are Pet Food Ontology Agent.

You answer only using graph data, rule evaluations, and tool results.

You must NOT:
- provide veterinary diagnosis
- claim a product treats or prevents diseases
- invent product data, ingredients, or rules
- hide data limitations

Every answer must include:
- conclusion
- graph evidence
- triggered rules (if any)
- data insufficiency notes (if any)
- tool usage log
- non-medical disclaimer

回答使用中文。格式：

## 结论
## 图谱证据
## 规则判断
## 数据不足（如有）
## 使用工具
## 注意事项

本回答仅基于当前图谱数据和规则，不构成兽医诊断。
"""

# =====================================================
# Tool Definitions (OpenAI function-calling format)
# =====================================================

PET_FOOD_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_product_risk_explanation",
            "description": "查询产品的完整风险解释，包括品牌、成分、触发的风险规则和数据不足信息。",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id_or_name": {"type": "string", "description": "产品 ID (如 PF001) 或产品名称关键词"}
                },
                "required": ["product_id_or_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_rule_evaluations",
            "description": "查询产品的完整规则评估状态（triggered/passed/not_evaluable/not_applicable）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id_or_name": {"type": "string", "description": "产品 ID 或名称关键词"}
                },
                "required": ["product_id_or_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_by_ingredient",
            "description": "查找包含某成分的所有产品。",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_name": {"type": "string", "description": "成分名称 (如 chicken, taurine)"}
                },
                "required": ["ingredient_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_without_ingredient",
            "description": "查找不含某成分的所有产品。用于过敏规避。",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_name": {"type": "string", "description": "要规避的成分名称"},
                    "species": {"type": "string", "description": "可选: 筛选物种 (cat/dog)"}
                },
                "required": ["ingredient_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_by_species",
            "description": "查找面向某物种的所有产品。",
            "parameters": {
                "type": "object",
                "properties": {
                    "species": {"type": "string", "description": "物种: cat 或 dog"}
                },
                "required": ["species"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_high_risk_products",
            "description": "查找所有触发了风险规则的产品。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_with_not_evaluable_rules",
            "description": "查找存在数据不足规则的产品。这些产品可能有未被检测到的风险。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_products",
            "description": "比较两个产品的营养和风险差异。",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_a": {"type": "string", "description": "产品 A 的 ID"},
                    "product_b": {"type": "string", "description": "产品 B 的 ID"}
                },
                "required": ["product_a", "product_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_alternatives",
            "description": "推荐不含某成分的替代产品。",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string", "description": "当前产品 ID"},
                    "avoid_ingredient": {"type": "string", "description": "要规避的成分"}
                },
                "required": ["product_id"],
            },
        },
    },
]

# =====================================================
# Tool Implementations (unified output schema)
# =====================================================

def _wrap(tool_name, data, evidence=None, limitations=None):
    return {
        "tool_name": tool_name,
        "status": "success",
        "data": data,
        "evidence": evidence or [],
        "limitations": limitations or [],
    }


def _wrap_error(tool_name, status, message):
    return {"tool_name": tool_name, "status": status, "message": message, "limitations": []}


def _resolve_product_id(identifier: str) -> str | None:
    """Resolve a product ID from an ID string or name keyword."""
    if re.match(r'^PF\d+$', identifier.upper()):
        return identifier.upper()
    driver = get_driver()
    with driver.session() as session:
        r = session.run(
            "MATCH (p:PetFoodProduct) WHERE toLower(p.product_name) CONTAINS toLower($q) "
            "RETURN p.id AS id LIMIT 1", q=identifier
        ).single()
        return r["id"] if r else None


def tool_get_product_risk_explanation(product_id_or_name: str) -> dict:
    """查询产品的完整风险解释。"""
    pid = _resolve_product_id(product_id_or_name)
    if not pid:
        return _wrap_error("get_product_risk_explanation", "not_found", f"产品未找到: {product_id_or_name}")

    driver = get_driver()
    with driver.session() as session:
        p = dict(session.run("MATCH (p:PetFoodProduct {id: $pid}) RETURN p", pid=pid).single()["p"])
        brand_r = session.run("MATCH (p:PetFoodProduct {id: $pid})-[:MADE_BY]->(b:Brand) RETURN b", pid=pid).single()
        brand = dict(brand_r["b"]) if brand_r else {}

        ings_r = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[c:CONTAINS]->(i:Ingredient) "
            "RETURN i.ingredient_name AS name ORDER BY c.ingredient_order", pid=pid
        )
        ingredient_names = [(r["name"] or "").lower().strip() for r in ings_r]

        risks_r = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[e:TRIGGERS_RISK]->(r:RiskRule) "
            "RETURN r.rule_name AS name, r.rule_id AS rule_id, e.severity AS sev, "
            "e.evidence AS ev, e.reason AS reason", pid=pid
        )
        risks = [dict(r) for r in risks_r]

    # Rule evaluations
    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)
    evaluations = engine.evaluate_product_full(p, ingredient_names)
    not_evaluable = [e for e in evaluations if e["status"] == "not_evaluable"]

    limitations = []
    if not_evaluable:
        limitations.append(f"{len(not_evaluable)} 条规则因数据不足无法评估")

    return _wrap(
        "get_product_risk_explanation",
        data={"product": p, "brand": brand, "ingredients": ingredient_names, "risks": risks, "not_evaluable": not_evaluable},
        evidence=[f"{r['rule_id']}: {r['ev']}" for r in risks],
        limitations=limitations,
    )


def tool_get_product_rule_evaluations(product_id_or_name: str) -> dict:
    """查询产品的完整规则评估状态。"""
    pid = _resolve_product_id(product_id_or_name)
    if not pid:
        return _wrap_error("get_product_rule_evaluations", "not_found", f"产品未找到: {product_id_or_name}")

    driver = get_driver()
    with driver.session() as session:
        p = dict(session.run("MATCH (p:PetFoodProduct {id: $pid}) RETURN p", pid=pid).single()["p"])
        ings_r = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[c:CONTAINS]->(i:Ingredient) "
            "RETURN i.ingredient_name AS name", pid=pid
        )
        ingredient_names = [(r["name"] or "").lower().strip() for r in ings_r]

    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)
    evaluations = engine.evaluate_product_full(p, ingredient_names)

    return _wrap(
        "get_product_rule_evaluations",
        data={"product_id": pid, "evaluations": evaluations},
    )


def tool_find_products_by_ingredient(ingredient_name: str) -> dict:
    """查找包含某成分的所有产品。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct)-[:CONTAINS]->(i:Ingredient) "
            "WHERE toLower(i.ingredient_name) = toLower($name) "
            "RETURN p.id AS id, p.product_name AS name, p.target_species AS species, p.life_stage AS stage "
            "ORDER BY p.product_name", name=ingredient_name
        )
        products = [r.data() for r in result]

    if not products:
        return _wrap("find_products_by_ingredient", data=[], limitations=[f"未找到含 {ingredient_name} 的产品"])

    return _wrap("find_products_by_ingredient", data=products, evidence=[f"{len(products)} products contain {ingredient_name}"])


def tool_find_products_without_ingredient(ingredient_name: str, species: str = None) -> dict:
    """查找不含某成分的所有产品。"""
    driver = get_driver()
    with driver.session() as session:
        q = (
            "MATCH (p:PetFoodProduct) "
            "WHERE NOT EXISTS { MATCH (p)-[:CONTAINS]->(i:Ingredient) WHERE toLower(i.ingredient_name) = toLower($name) } "
        )
        if species:
            q += "AND p.target_species = $species "
        q += ("OPTIONAL MATCH (p)-[:MADE_BY]->(b:Brand) "
              "RETURN p.id AS id, p.product_name AS name, p.target_species AS species, "
              "b.brand_name AS brand, p.life_stage AS stage ORDER BY p.product_name")
        params = {"name": ingredient_name}
        if species:
            params["species"] = species
        products = [r.data() for r in session.run(q, **params)]

    return _wrap("find_products_without_ingredient", data=products, evidence=[f"{len(products)} products without {ingredient_name}"])


def tool_find_products_by_species(species: str) -> dict:
    """查找面向某物种的所有产品。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct) WHERE p.target_species = $species "
            "OPTIONAL MATCH (p)-[:MADE_BY]->(b:Brand) "
            "RETURN p.id AS id, p.product_name AS name, b.brand_name AS brand, p.life_stage AS stage "
            "ORDER BY p.product_name", species=species
        )
        products = [r.data() for r in result]

    return _wrap("find_products_by_species", data=products, evidence=[f"{len(products)} {species} products"])


def tool_find_high_risk_products() -> dict:
    """查找所有触发了风险规则的产品。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct)-[e:TRIGGERS_RISK]->(r:RiskRule) "
            "RETURN p.id AS id, p.product_name AS name, "
            "r.rule_name AS rule, r.rule_id AS rule_id, e.severity AS severity, e.evidence AS evidence "
            "ORDER BY e.severity DESC, p.product_name"
        )
        products = [r.data() for r in result]

    return _wrap("find_high_risk_products", data=products, evidence=[f"{len(products)} high-risk products"])


def tool_find_products_with_not_evaluable_rules() -> dict:
    """查找存在数据不足规则的产品。"""
    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)

    driver = get_driver()
    with driver.session() as session:
        products_r = session.run("MATCH (p:PetFoodProduct) RETURN p")
        products = [dict(r["p"]) for r in products_r]

    report = engine.evaluate_payload({"nodes": [{"id": p["id"], "label": "PetFoodProduct", "properties": p} for p in products], "edges": []})

    results = []
    for pid, evals in report["products"].items():
        ne = evals["not_evaluable"]
        if ne:
            results.append({
                "product_id": pid,
                "not_evaluable_count": len(ne),
                "rules": [{"rule_id": e["rule_id"], "evidence": e["evidence"]} for e in ne],
            })

    return _wrap(
        "find_products_with_not_evaluable_rules",
        data=results,
        evidence=[f"{len(results)} products have not-evaluable rules"],
        limitations=["这些产品的某些风险无法评估，不代表安全"],
    )


def tool_compare_products(product_a: str, product_b: str) -> dict:
    """比较两个产品的风险差异。"""
    pa = tool_get_product_risk_explanation(product_a)
    pb = tool_get_product_risk_explanation(product_b)

    if pa["status"] != "success":
        return _wrap_error("compare_products", pa["status"], f"产品 A: {pa.get('message', 'error')}")
    if pb["status"] != "success":
        return _wrap_error("compare_products", pb["status"], f"产品 B: {pb.get('message', 'error')}")

    return _wrap("compare_products", data={"product_a": pa["data"], "product_b": pb["data"]})


def tool_recommend_alternatives(product_id: str, avoid_ingredient: str = None) -> dict:
    """推荐不含某成分的替代产品。"""
    pid = _resolve_product_id(product_id)
    if not pid:
        return _wrap_error("recommend_alternatives", "not_found", f"产品未找到: {product_id}")

    driver = get_driver()
    with driver.session() as session:
        p = session.run("MATCH (p:PetFoodProduct {id: $pid}) RETURN p", pid=pid).single()
        if not p:
            return _wrap_error("recommend_alternatives", "not_found", f"产品未找到: {product_id}")
        p = dict(p["p"])

    species = p.get("target_species")
    stage = p.get("life_stage")
    ingredient = avoid_ingredient or "chicken"

    # Find products of same species/stage without the ingredient
    alt_result = tool_find_products_without_ingredient(ingredient, species)
    alternatives = [a for a in alt_result.get("data", []) if a.get("id") != pid]

    return _wrap(
        "recommend_alternatives",
        data={"current_product": p, "avoid_ingredient": ingredient, "alternatives": alternatives},
        evidence=[f"{len(alternatives)} alternatives found"],
    )


# =====================================================
# Tool Dispatcher
# =====================================================

TOOL_MAP = {
    "get_product_risk_explanation": lambda args: tool_get_product_risk_explanation(**args),
    "get_product_rule_evaluations": lambda args: tool_get_product_rule_evaluations(**args),
    "find_products_by_ingredient": lambda args: tool_find_products_by_ingredient(**args),
    "find_products_without_ingredient": lambda args: tool_find_products_without_ingredient(**args),
    "find_products_by_species": lambda args: tool_find_products_by_species(**args),
    "find_high_risk_products": lambda args: tool_find_high_risk_products(),
    "find_products_with_not_evaluable_rules": lambda args: tool_find_products_with_not_evaluable_rules(),
    "compare_products": lambda args: tool_compare_products(**args),
    "recommend_alternatives": lambda args: tool_recommend_alternatives(**args),
}


def _execute_tool(name: str, args: dict) -> dict:
    handler = TOOL_MAP.get(name)
    if not handler:
        return _wrap_error(name, "error", f"Unknown tool: {name}")
    try:
        return handler(args)
    except Exception as e:
        return _wrap_error(name, "error", str(e))


# =====================================================
# LLM Planner + Grounded Answer
# =====================================================

def _call_llm_safe(messages, tools=None):
    """Call LLM via llm_client, return None on failure."""
    try:
        from llm_client import _call_llm
        return _call_llm(messages, tools)
    except Exception:
        return None


def _llm_plan(question: str, context: dict = None) -> list[dict] | None:
    """Ask LLM to select tools. Returns list of {tool, args} or None if LLM unavailable."""
    ctx_hint = ""
    if context and context.get("current_product_id"):
        ctx_hint = f"\n当前选中产品: {context['current_product_id']}。如果用户说'这个产品'，优先使用此 ID。"

    messages = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f"用户问题: {question}{ctx_hint}\n\n"
            "请从可用工具中选择合适的工具来回答这个问题。输出 JSON 数组格式:\n"
            '[{"tool": "tool_name", "args": {...}}]\n'
            "只输出 JSON，不要其他文字。可以调用多个工具。"
        )},
    ]

    resp = _call_llm_safe(messages, PET_FOOD_TOOLS)
    if not resp:
        return None

    msg = resp.get("message", {})
    content = msg.get("content", "")

    # Try function calling first
    tool_calls = msg.get("tool_calls")
    if tool_calls:
        calls = []
        for tc in tool_calls:
            fn = tc.get("function", {})
            try:
                args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            calls.append({"tool": fn.get("name", ""), "args": args})
        return calls if calls else None

    # Try parsing JSON from content
    try:
        # Find JSON array in content
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            calls = json.loads(match.group())
            if isinstance(calls, list) and all("tool" in c for c in calls):
                return calls
    except (json.JSONDecodeError, AttributeError):
        pass

    return None


def _llm_compose_answer(question: str, tool_results: list[dict], context: dict = None) -> str | None:
    """Ask LLM to compose a grounded answer from tool results. Returns markdown or None."""
    results_text = json.dumps(tool_results, ensure_ascii=False, indent=2)

    messages = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f"用户问题: {question}\n\n"
            f"工具查询结果:\n{results_text}\n\n"
            "请基于以上工具结果回答用户问题。严格遵守格式要求。不要编造数据。"
            "如果数据不足，必须明确说明。"
        )},
    ]

    resp = _call_llm_safe(messages)
    if not resp:
        return None

    content = resp.get("message", {}).get("content", "")
    return content.strip() if content.strip() else None


# =====================================================
# Deterministic fallback (keyword routing)
# =====================================================

def _keyword_route(question: str, context: dict = None) -> list[dict]:
    """Simple keyword routing — same logic as v1 agent."""
    q = question.lower()
    calls = []

    if "比较" in q or "compare" in q:
        ids = re.findall(r'PF\d+', question.upper())
        if len(ids) >= 2:
            calls.append({"tool": "compare_products", "args": {"product_a": ids[0], "product_b": ids[1]}})
    elif "taurine" in q or "牛磺酸" in q:
        calls.append({"tool": "find_cat_foods_missing_taurine_legacy", "args": {}})
    elif "数据不足" in q or "not evaluable" in q or "无法评估" in q:
        calls.append({"tool": "find_products_with_not_evaluable_rules", "args": {}})
    elif ("phosphorus" in q or "磷" in q) and ("senior" in q or "老年" in q):
        calls.append({"tool": "get_product_risk_explanation", "args": {"product_id_or_name": "senior"}})
    elif "避开" in q or "过敏" in q or "不含" in q or "without" in q:
        for word in ["chicken", "salmon", "beef", "rice"]:
            if word in q:
                calls.append({"tool": "find_products_without_ingredient", "args": {"ingredient_name": word}})
                break
        if not calls:
            calls.append({"tool": "find_products_without_ingredient", "args": {"ingredient_name": "chicken"}})
    elif "含" in q or "contain" in q or "chicken" in q:
        for word in ["chicken", "salmon", "beef", "taurine"]:
            if word in q:
                calls.append({"tool": "find_products_by_ingredient", "args": {"ingredient_name": word}})
                break
        if not calls:
            calls.append({"tool": "find_products_by_ingredient", "args": {"ingredient_name": "chicken"}})
    elif "high risk" in q or "高风险" in q:
        ids = re.findall(r'PF\d+', question.upper())
        if ids:
            calls.append({"tool": "get_product_risk_explanation", "args": {"product_id_or_name": ids[0]}})
        else:
            calls.append({"tool": "find_high_risk_products", "args": {}})
    elif "猫粮" in q or "cat food" in q or "cat" in q:
        calls.append({"tool": "find_products_by_species", "args": {"species": "cat"}})
    elif "狗粮" in q or "dog food" in q or "dog" in q:
        calls.append({"tool": "find_products_by_species", "args": {"species": "dog"}})
    else:
        ids = re.findall(r'PF\d+', question.upper())
        if ids:
            calls.append({"tool": "get_product_risk_explanation", "args": {"product_id_or_name": ids[0]}})
        else:
            calls.append({"tool": "find_high_risk_products", "args": {}})

    # Add context-aware product lookup
    if context and context.get("current_product_id") and not calls:
        calls.append({"tool": "get_product_risk_explanation", "args": {"product_id_or_name": context["current_product_id"]}})

    return calls


# =====================================================
# Main entry point
# =====================================================

def chat(question: str, context: dict = None) -> dict:
    """
    Pet Food Agent v2 主入口。

    Flow:
    1. LLM planner selects tools (fallback: keyword router)
    2. Execute tools
    3. LLM composes grounded answer (fallback: template answer)
    """
    ts = lambda: time.strftime("%H:%M:%S", time.localtime())
    logs = []
    used_tools = []
    step = 1

    # 1. Plan tool calls
    logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "orange",
                 "message": f"分析问题: {question}", "timestamp": ts()})
    step += 1

    llm_used = False
    calls = _llm_plan(question, context)
    if calls:
        llm_used = True
        logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "cyan",
                     "message": f"LLM 选择工具: {[c['tool'] for c in calls]}", "timestamp": ts()})
    else:
        calls = _keyword_route(question, context)
        logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "amber",
                     "message": f"LLM 未配置，使用规则路由: {[c['tool'] for c in calls]}", "timestamp": ts()})
    step += 1

    # 2. Execute tools
    tool_results = []
    for call in calls:
        tool_name = call["tool"]
        args = call.get("args", {})

        # Handle legacy tool name from keyword routing
        if tool_name == "find_cat_foods_missing_taurine_legacy":
            # Use the v1 function directly
            from petfood_agent import find_cat_foods_missing_taurine
            legacy_result = find_cat_foods_missing_taurine()
            result = _wrap("find_cat_foods_missing_taurine", data=legacy_result)
        else:
            result = _execute_tool(tool_name, args)

        tool_results.append(result)
        used_tools.append(tool_name)

        status_emoji = "✅" if result["status"] == "success" else "⚠️"
        data_summary = ""
        if isinstance(result.get("data"), list):
            data_summary = f" ({len(result['data'])} results)"
        elif isinstance(result.get("data"), dict):
            data_summary = f" (dict)"

        logs.append({"step": step, "type": "observation", "icon": status_emoji, "color": "green" if result["status"] == "success" else "amber",
                     "message": f"工具 {tool_name}{data_summary}\n{result.get('message', '') or ''}", "timestamp": ts()})
        step += 1

    # 3. Compose answer
    answer = None
    if llm_used:
        answer = _llm_compose_answer(question, tool_results, context)
        if answer:
            logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "cyan",
                         "message": "LLM 生成回答", "timestamp": ts()})
            step += 1

    if not answer:
        answer = _template_answer(question, tool_results)
        logs.append({"step": step, "type": "thought", "icon": "📝", "color": "amber",
                     "message": "使用模板生成回答", "timestamp": ts()})
        step += 1

    # 4. Disclaimer
    logs.append({"step": step, "type": "thought", "icon": "📌", "color": "blue",
                 "message": "本回答仅基于当前图谱数据和规则，不构成兽医诊断。", "timestamp": ts()})

    # Ensure disclaimer is in the answer
    if "不构成兽医诊断" not in answer:
        answer += "\n\n---\n*本回答仅基于当前图谱数据和规则，不构成兽医诊断。*"

    return {
        "logs": logs,
        "answer": answer,
        "tools_used": used_tools,
        "llm_used": llm_used,
    }


def _template_answer(question: str, tool_results: list[dict]) -> str:
    """Template-based answer generation (deterministic fallback)."""
    lines = ["## 结论\n"]

    for result in tool_results:
        tool = result.get("tool_name", "")
        data = result.get("data")

        if tool == "get_product_risk_explanation" and isinstance(data, dict) and "product" in data:
            p = data["product"]
            brand = data.get("brand", {})
            risks = data.get("risks", [])
            not_evaluable = data.get("not_evaluable", [])

            if risks:
                lines.append(f"产品 **{p.get('product_name')}** 触发了 {len(risks)} 条风险规则。\n")
                lines.append("## 图谱证据\n")
                lines.append(f"- 品牌: {brand.get('brand_name', '未知')} | 物种: {p.get('target_species')} | 阶段: {p.get('life_stage')}")
                lines.append(f"- 蛋白质: {p.get('protein_100g')}g | 脂肪: {p.get('fat_100g')}g | 磷: {p.get('phosphorus_100g')}g")
                lines.append("\n## 规则判断\n")
                for r in risks:
                    lines.append(f"- **{r.get('rule_name', r.get('name'))}** ({r.get('sev', r.get('severity'))}): {r.get('ev', r.get('evidence', ''))}")
            else:
                lines.append(f"产品 **{p.get('product_name')}** 未触发任何风险规则。\n")

            if not_evaluable:
                lines.append("\n## 数据不足\n")
                for ne in not_evaluable:
                    lines.append(f"- **{ne['rule_id']}**: {ne['evidence']}")
                lines.append("\n未触发这些规则不代表产品安全，仅代表当前数据不足以做出判断。")

        elif isinstance(data, list):
            if not data:
                lines.append("未找到匹配的产品。\n")
            else:
                lines.append(f"找到 **{len(data)}** 个结果：\n")
                lines.append("## 图谱证据\n")
                for item in data[:10]:
                    name = item.get("name", item.get("product_name", item.get("id", "")))
                    extra = ""
                    if "rule" in item:
                        extra = f" — {item['rule']} ({item.get('severity', '')})"
                    if "evidence" in item and "rule" not in item:
                        extra = f" — {item['evidence']}"
                    lines.append(f"- {name}{extra}")

        elif isinstance(data, dict) and "product_a" in data:
            pa, pb = data["product_a"], data["product_b"]
            lines.append(f"对比 {pa['product'].get('product_name')} 和 {pb['product'].get('product_name')}\n")
            lines.append("## 图谱证据\n")
            lines.append(f"| 指标 | {pa['product'].get('product_name')} | {pb['product'].get('product_name')} |")
            lines.append("|------|------|------|")
            lines.append(f"| 风险数 | {len(pa.get('risks', []))} | {len(pb.get('risks', []))} |")
            lines.append(f"| 数据不足 | {len(pa.get('not_evaluable', []))} | {len(pb.get('not_evaluable', []))} |")

        elif result.get("status") != "success":
            lines.append(f"查询失败: {result.get('message', 'unknown error')}\n")

    if not tool_results:
        lines.append("未能处理该问题，请尝试更具体的提问。\n")

    # Tools used
    lines.append("\n## 使用工具\n")
    for result in tool_results:
        lines.append(f"- {result.get('tool_name', 'unknown')}")

    lines.append("\n## 注意事项\n")
    lines.append("本回答仅基于当前图谱数据和规则，不构成兽医诊断。")

    return "\n".join(lines)
