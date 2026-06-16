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

Always respond in English. Format:

## Conclusion
## Graph Evidence
## Rule Evaluation
## Data Limitations (if any)
## Tools Used
## Note

The note must include:
This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.
"""

# =====================================================
# Tool Definitions (OpenAI function-calling format)
# =====================================================

PET_FOOD_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_product_risk_explanation",
            "description": "Get full risk explanation for a product, including brand, ingredients, triggered risk rules, and data limitations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id_or_name": {"type": "string", "description": "Product ID (e.g. PF001) or product name keyword"}
                },
                "required": ["product_id_or_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_rule_evaluations",
            "description": "Get full rule evaluation status for a product (triggered/passed/not_evaluable/not_applicable).",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id_or_name": {"type": "string", "description": "Product ID or name keyword"}
                },
                "required": ["product_id_or_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_by_ingredient",
            "description": "Find all products containing a specific ingredient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_name": {"type": "string", "description": "Ingredient name (e.g. chicken, taurine)"}
                },
                "required": ["ingredient_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_without_ingredient",
            "description": "Find all products that do not contain a specific ingredient. Useful for allergy avoidance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_name": {"type": "string", "description": "Ingredient to avoid"},
                    "species": {"type": "string", "description": "Optional: filter by species (cat/dog)"}
                },
                "required": ["ingredient_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_by_species",
            "description": "Find all products targeted at a specific species.",
            "parameters": {
                "type": "object",
                "properties": {
                    "species": {"type": "string", "description": "Species: cat or dog"}
                },
                "required": ["species"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_high_risk_products",
            "description": "Find all products that triggered a risk rule.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_products_with_not_evaluable_rules",
            "description": "Find products with not-evaluable rules due to missing data. These products may have undetected risks.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_products",
            "description": "Compare nutrition and risk differences between two products.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_a": {"type": "string", "description": "Product A ID"},
                    "product_b": {"type": "string", "description": "Product B ID"}
                },
                "required": ["product_a", "product_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_alternatives",
            "description": "Recommend alternative products that avoid a specific ingredient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string", "description": "Current product ID"},
                    "avoid_ingredient": {"type": "string", "description": "Ingredient to avoid"}
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_cat_foods_missing_taurine",
            "description": "Find cat food products that triggered the missing taurine risk rule (RR002).",
            "parameters": {"type": "object", "properties": {}},
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
    """Get full risk explanation for a product."""
    pid = _resolve_product_id(product_id_or_name)
    if not pid:
        return _wrap_error("get_product_risk_explanation", "not_found", f"Product not found: {product_id_or_name}")

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
        limitations.append(f"{len(not_evaluable)} rule(s) could not be evaluated due to insufficient data")

    return _wrap(
        "get_product_risk_explanation",
        data={"product": p, "brand": brand, "ingredients": ingredient_names, "risks": risks, "not_evaluable": not_evaluable},
        evidence=[f"{r['rule_id']}: {r['ev']}" for r in risks],
        limitations=limitations,
    )


def tool_get_product_rule_evaluations(product_id_or_name: str) -> dict:
    """Get full rule evaluation status for a product."""
    pid = _resolve_product_id(product_id_or_name)
    if not pid:
        return _wrap_error("get_product_rule_evaluations", "not_found", f"Product not found: {product_id_or_name}")

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
    """Find all products containing a specific ingredient."""
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
        return _wrap("find_products_by_ingredient", data=[], limitations=[f"No products found containing {ingredient_name}"])

    return _wrap("find_products_by_ingredient", data=products, evidence=[f"{len(products)} products contain {ingredient_name}"])


def tool_find_products_without_ingredient(ingredient_name: str, species: str = None) -> dict:
    """Find all products that do not contain a specific ingredient."""
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
    """Find all products targeted at a specific species."""
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
    """Find all products that triggered a risk rule."""
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
    """Find products with not-evaluable rules due to missing data."""
    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)

    driver = get_driver()
    with driver.session() as session:
        products_r = session.run("MATCH (p:PetFoodProduct) RETURN p")
        products = [dict(r["p"]) for r in products_r]

        # Query each product's ingredient names from CONTAINS edges
        ingredient_map = {}
        ings_r = session.run(
            "MATCH (p:PetFoodProduct)-[:CONTAINS]->(i:Ingredient) "
            "RETURN p.id AS pid, i.ingredient_name AS name"
        )
        for r in ings_r:
            pid = r["pid"]
            name = (r["name"] or "").lower().strip()
            ingredient_map.setdefault(pid, []).append(name)

    results = []
    for p in products:
        pid = p["id"]
        ingredient_names = ingredient_map.get(pid, [])
        evaluations = engine.evaluate_product_full(p, ingredient_names)
        ne = [e for e in evaluations if e["status"] == "not_evaluable"]
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
        limitations=["Some risks for these products could not be evaluated — this does not mean they are safe."],
    )


def tool_compare_products(product_a: str, product_b: str) -> dict:
    """Compare risk differences between two products."""
    pa = tool_get_product_risk_explanation(product_a)
    pb = tool_get_product_risk_explanation(product_b)

    if pa["status"] != "success":
        return _wrap_error("compare_products", pa["status"], f"Product A: {pa.get('message', 'error')}")
    if pb["status"] != "success":
        return _wrap_error("compare_products", pb["status"], f"Product B: {pb.get('message', 'error')}")

    return _wrap("compare_products", data={"product_a": pa["data"], "product_b": pb["data"]})


def tool_recommend_alternatives(product_id: str, avoid_ingredient: str = None) -> dict:
    """Recommend alternative products that avoid a specific ingredient."""
    pid = _resolve_product_id(product_id)
    if not pid:
        return _wrap_error("recommend_alternatives", "not_found", f"Product not found: {product_id}")

    driver = get_driver()
    with driver.session() as session:
        p = session.run("MATCH (p:PetFoodProduct {id: $pid}) RETURN p", pid=pid).single()
        if not p:
            return _wrap_error("recommend_alternatives", "not_found", f"Product not found: {product_id}")
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
    "find_cat_foods_missing_taurine": lambda args: tool_find_cat_foods_missing_taurine(),
}


def tool_find_cat_foods_missing_taurine() -> dict:
    """Find cat food products that triggered the missing taurine risk rule (RR002)."""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            'MATCH (p:PetFoodProduct)-[e:TRIGGERS_RISK]->(r:RiskRule {rule_id: "RR002"}) '
            "RETURN p.id AS id, p.product_name AS name, e.evidence AS evidence, e.reason AS reason"
        )
        products = [r.data() for r in result]

    if not products:
        return _wrap("find_cat_foods_missing_taurine", data=[], limitations=["No products triggered the missing taurine rule."])

    return _wrap(
        "find_cat_foods_missing_taurine",
        data=products,
        evidence=[f"{len(products)} cat foods missing taurine (RR002)"],
    )


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
        ctx_hint = f"\nCurrently selected product: {context['current_product_id']}. If the user says 'this product', prefer this ID."

    messages = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": (
            f"User question: {question}{ctx_hint}\n\n"
            "Select the appropriate tools to answer this question. Output a JSON array:\n"
            '[{"tool": "tool_name", "args": {...}}]\n'
            "Output only JSON, no other text. You may call multiple tools."
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
            f"User question: {question}\n\n"
            f"Tool results:\n{results_text}\n\n"
            "Answer the user's question based strictly on the tool results above. Follow the required format. "
            "Do not fabricate data. If data is insufficient, state this explicitly."
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
        calls.append({"tool": "find_cat_foods_missing_taurine", "args": {}})
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
    Pet Food Agent v2 entry point.

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
                 "message": f"Analyzing question: {question}", "timestamp": ts()})
    step += 1

    llm_used = False
    calls = _llm_plan(question, context)
    if calls:
        llm_used = True
        logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "cyan",
                     "message": f"LLM selected tools: {[c['tool'] for c in calls]}", "timestamp": ts()})
    else:
        calls = _keyword_route(question, context)
        logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "amber",
                     "message": f"LLM planning unavailable, using deterministic router: {[c['tool'] for c in calls]}", "timestamp": ts()})
    step += 1

    # 2. Execute tools
    tool_results = []
    for call in calls:
        tool_name = call["tool"]
        args = call.get("args", {})

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
                     "message": f"Tool {tool_name}{data_summary}\n{result.get('message', '') or ''}", "timestamp": ts()})
        step += 1

    # 3. Compose answer
    answer = None
    if llm_used:
        answer = _llm_compose_answer(question, tool_results, context)
        if answer:
            logs.append({"step": step, "type": "thought", "icon": "🧠", "color": "cyan",
                         "message": "LLM generated answer", "timestamp": ts()})
            step += 1

    if not answer:
        zh = _is_chinese(question)
        if _is_recommendation_question(question):
            answer = _recommendation_template(question, tool_results, zh)
            logs.append({"step": step, "type": "thought", "icon": "📝", "color": "amber",
                         "message": "Using recommendation template to generate answer", "timestamp": ts()})
        else:
            answer = _template_answer(question, tool_results)
            logs.append({"step": step, "type": "thought", "icon": "📝", "color": "amber",
                         "message": "Using template to generate answer", "timestamp": ts()})
        step += 1

    # 4. Disclaimer
    logs.append({"step": step, "type": "thought", "icon": "📌", "color": "blue",
                 "message": "This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.", "timestamp": ts()})

    # Ensure disclaimer is in the answer, in the correct language
    zh = _is_chinese(question)
    has_en_disclaimer = "not veterinary diagnosis" in answer.lower()
    has_zh_disclaimer = "不做兽医诊断" in answer
    if zh:
        # Remove any English disclaimer variants
        for phrase in [
            "*This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.*",
            "This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.",
            "It is not veterinary diagnosis.",
        ]:
            answer = answer.replace(phrase, "").rstrip()
        # Add Chinese disclaimer if missing
        if not has_zh_disclaimer:
            answer += "\n\n---\n*本回答仅基于当前本体数据和规则，不做兽医诊断。*"
    else:
        if not has_en_disclaimer:
            answer += "\n\n---\n*This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.*"

    return {
        "logs": logs,
        "answer": answer,
        "tools_used": used_tools,
        "llm_used": llm_used,
    }


def _is_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    return any('一' <= ch <= '鿿' for ch in text)


def _is_recommendation_question(question: str) -> bool:
    """Detect whether the user is asking for a product recommendation."""
    q = question.lower()
    return bool(re.search(
        r"推荐|recommend|should I feed|我应该喂|suggest.*food|alternative|替代|which.*food.*best|哪个.*最好|哪个.*适合",
        q,
    ))


def _template_answer(question: str, tool_results: list[dict]) -> str:
    """Template-based answer generation (deterministic fallback)."""
    zh = _is_chinese(question)

    lines = ["## 结论\n"] if zh else ["## Conclusion\n"]

    for result in tool_results:
        tool = result.get("tool_name", "")
        data = result.get("data")

        if tool == "get_product_risk_explanation" and isinstance(data, dict) and "product" in data:
            p = data["product"]
            brand = data.get("brand", {})
            risks = data.get("risks", [])
            not_evaluable = data.get("not_evaluable", [])

            if risks:
                if zh:
                    lines.append(f"产品 **{p.get('product_name')}** 触发了 {len(risks)} 条风险规则。\n")
                    lines.append("## 图谱证据\n")
                    lines.append(f"- 品牌: {brand.get('brand_name', '未知')} | 物种: {p.get('target_species')} | 生命阶段: {p.get('life_stage')}")
                    lines.append(f"- 蛋白质: {p.get('protein_100g')}g | 脂肪: {p.get('fat_100g')}g | 磷: {p.get('phosphorus_100g')}g")
                    lines.append("\n## 规则评估\n")
                else:
                    lines.append(f"Product **{p.get('product_name')}** triggered {len(risks)} risk rule(s).\n")
                    lines.append("## Graph Evidence\n")
                    lines.append(f"- Brand: {brand.get('brand_name', 'Unknown')} | Species: {p.get('target_species')} | Life stage: {p.get('life_stage')}")
                    lines.append(f"- Protein: {p.get('protein_100g')}g | Fat: {p.get('fat_100g')}g | Phosphorus: {p.get('phosphorus_100g')}g")
                    lines.append("\n## Rule Evaluation\n")
                for r in risks:
                    lines.append(f"- **{r.get('rule_name', r.get('name'))}** ({r.get('sev', r.get('severity'))}): {r.get('ev', r.get('evidence', ''))}")
            else:
                if zh:
                    lines.append(f"产品 **{p.get('product_name')}** 未触发任何风险规则。\n")
                else:
                    lines.append(f"Product **{p.get('product_name')}** did not trigger any risk rules.\n")

            if not_evaluable:
                if zh:
                    lines.append("\n## 数据不足\n")
                    for ne in not_evaluable:
                        lines.append(f"- **{ne['rule_id']}**: {ne['evidence']}")
                    lines.append("\n以下规则因数据缺失无法评估——未触发不代表产品安全。")
                else:
                    lines.append("\n## Data Limitations\n")
                    for ne in not_evaluable:
                        lines.append(f"- **{ne['rule_id']}**: {ne['evidence']}")
                    lines.append("\nThese rules were not triggered due to insufficient data — this does not mean the product is safe.")

        elif isinstance(data, list):
            if not data:
                lines.append("未找到匹配的产品。\n" if zh else "No matching products found.\n")
            else:
                lines.append(f"找到 **{len(data)}** 个结果：\n" if zh else f"Found **{len(data)}** result(s):\n")
                lines.append("## 图谱证据\n" if zh else "## Graph Evidence\n")
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
            if zh:
                lines.append(f"对比 {pa['product'].get('product_name')} 和 {pb['product'].get('product_name')}\n")
                lines.append("## 图谱证据\n")
            else:
                lines.append(f"Comparing {pa['product'].get('product_name')} and {pb['product'].get('product_name')}\n")
                lines.append("## Graph Evidence\n")
            lines.append("")
            lines.append(f"| {'指标' if zh else 'Metric'} | {pa['product'].get('product_name')} | {pb['product'].get('product_name')} |")
            lines.append("|---|---|---|")
            lines.append(f"| {'风险规则' if zh else 'Risk rules'} | {len(pa.get('risks', []))} | {len(pb.get('risks', []))} |")
            lines.append(f"| {'无法评估' if zh else 'Not evaluable'} | {len(pa.get('not_evaluable', []))} | {len(pb.get('not_evaluable', []))} |")
            lines.append("")

        elif result.get("status") != "success":
            lines.append(f"查询失败: {result.get('message', '未知错误')}\n" if zh else f"Query failed: {result.get('message', 'unknown error')}\n")

    if not tool_results:
        lines.append("无法处理此问题，请尝试更具体的查询。\n" if zh else "Could not process this question. Please try a more specific query.\n")

    # Tools used
    lines.append("\n## Tools Used\n")
    for result in tool_results:
        lines.append(f"- {result.get('tool_name', 'unknown')}")

    lines.append("\n## Note\n")
    lines.append("This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.")

    return "\n".join(lines)


def _recommendation_template(question: str, tool_results: list[dict], zh: bool) -> str:
    """Structured recommendation template with safety tables."""
    lines: list[str] = []

    # ── Collect products from tool results ───────────────────────────────
    all_products: list[dict] = []
    risk_products: list[dict] = []
    safe_products: list[dict] = []
    data_gaps: list[str] = []
    used_tools: list[str] = []

    for result in tool_results:
        tool = result.get("tool_name", "unknown")
        used_tools.append(tool)
        data = result.get("data")

        if isinstance(data, dict) and "product" in data:
            # Single product risk explanation
            p = data["product"]
            risks = data.get("risks", [])
            not_evaluable = data.get("not_evaluable", [])
            entry = {
                "id": p.get("id", ""),
                "name": p.get("product_name", ""),
                "species": p.get("target_species", ""),
                "stage": p.get("life_stage", ""),
                "risks": risks,
                "not_evaluable": not_evaluable,
            }
            all_products.append(entry)
            if risks:
                risk_products.append(entry)
            else:
                safe_products.append(entry)
            for ne in not_evaluable:
                data_gaps.append(f"{ne.get('rule_id', '?')}: {ne.get('evidence', '')}")

        elif isinstance(data, dict) and "alternatives" in data:
            # Recommendation alternatives
            current = data.get("current_product", {})
            avoid = data.get("avoid_ingredient", "")
            for alt in data.get("alternatives", []):
                safe_products.append({
                    "id": alt.get("id", ""),
                    "name": alt.get("name", ""),
                    "species": alt.get("species", ""),
                    "stage": alt.get("stage", ""),
                    "risks": [],
                    "not_evaluable": [],
                })
            if current:
                data_gaps.append(f"Alternatives avoid: {avoid}")

        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    entry = {
                        "id": item.get("id", item.get("product_id", "")),
                        "name": item.get("name", item.get("product_name", "")),
                        "species": item.get("species", ""),
                        "stage": item.get("stage", ""),
                        "risks": [],
                        "not_evaluable": [],
                        "rule": item.get("rule", item.get("rule_id", "")),
                        "severity": item.get("severity", ""),
                    }
                    if item.get("rule") or item.get("severity"):
                        risk_products.append(entry)
                    all_products.append(entry)

        elif result.get("status") != "success":
            data_gaps.append(f"Tool failed: {tool} — {result.get('message', 'unknown error')}")

    # ── Short Answer ─────────────────────────────────────────────────────
    if zh:
        lines.append("## 简要回答\n")
    else:
        lines.append("## Short Answer\n")

    if safe_products and not risk_products:
        if zh:
            lines.append(f"当前数据中有 {len(safe_products)} 个候选产品未触发已知风险规则。\n")
        else:
            lines.append(f"{len(safe_products)} candidate product(s) found in current data with no triggered risk rules.\n")
    elif risk_products and safe_products:
        if zh:
            lines.append(f"当前数据中有 {len(safe_products)} 个候选产品和 {len(risk_products)} 个需要避免或复核的产品。\n")
        else:
            lines.append(f"{len(safe_products)} candidate product(s) and {len(risk_products)} product(s) to avoid or review.\n")
    elif risk_products:
        if zh:
            lines.append(f"当前数据中所有匹配的产品均触发了风险规则，请优先复核。\n")
        else:
            lines.append(f"All matching products in current data triggered risk rules — review before use.\n")
    else:
        if zh:
            lines.append("未找到明确的推荐结果，请提供更多上下文。\n")
        else:
            lines.append("No clear recommendation found from current data. Please provide more context.\n")

    # ── Safer Options ────────────────────────────────────────────────────
    if zh:
        lines.append("\n## 当前数据中较安全的选择\n")
        lines.append("| 场景 | 候选产品 | 说明 |")
    else:
        lines.append("\n## Safer Options from Current Data\n")
        lines.append("| Situation | Candidate Products | Notes |")
    lines.append("|---|---|---|")

    if safe_products:
        # Group by species + stage
        groups: dict[str, list[str]] = {}
        for sp in safe_products:
            key = f"{sp.get('species', '?')} / {sp.get('stage', '?')}"
            groups.setdefault(key, []).append(sp["name"])
        for group_key, names in groups.items():
            lines.append(f"| {group_key} | {', '.join(names[:5])} | {'OK' if not zh else '无已知风险'} |")
    else:
        if zh:
            lines.append("| — | 当前数据中无候选 | 需要更多产品数据 |")
        else:
            lines.append("| — | No candidates in current data | More product data needed |")

    # ── Products to Avoid or Review ──────────────────────────────────────
    if zh:
        lines.append("\n## 需要避免或复核的产品\n")
        lines.append("| 产品 | 原因 | 规则证据 |")
    else:
        lines.append("\n## Products to Avoid or Review\n")
        lines.append("| Product | Reason | Rule Evidence |")
    lines.append("|---|---|---|")

    if risk_products:
        for rp in risk_products[:10]:
            reasons = []
            evidence_parts = []
            for r in rp.get("risks", []):
                rule_name = r.get("rule_name", r.get("name", ""))
                reasons.append(rule_name)
                evidence_parts.append(r.get("ev", r.get("evidence", "")))
            if rp.get("rule"):
                reasons.append(rp["rule"])
                evidence_parts.append(rp.get("severity", ""))
            reason_str = "; ".join(reasons) if reasons else ("未知风险" if zh else "Unknown risk")
            ev_str = "; ".join(evidence_parts) if evidence_parts else "—"
            lines.append(f"| {rp['name']} | {reason_str} | {ev_str} |")
    else:
        if zh:
            lines.append("| — | 无 | — |")
        else:
            lines.append("| — | None | — |")

    # ── Data Gaps ────────────────────────────────────────────────────────
    if data_gaps:
        if zh:
            lines.append("\n## 数据缺口\n")
        else:
            lines.append("\n## Data Gaps\n")
        for gap in data_gaps[:8]:
            lines.append(f"- {gap}")

    # ── Tools Used ───────────────────────────────────────────────────────
    if zh:
        lines.append("\n## 使用的工具\n")
    else:
        lines.append("\n## Tools Used\n")
    for t in used_tools:
        lines.append(f"- {t}")

    # ── Safety Note ──────────────────────────────────────────────────────
    if zh:
        lines.append("\n## 安全提示\n")
        lines.append("本回答仅基于当前本体数据和规则，不做兽医诊断。")
    else:
        lines.append("\n## Safety Note\n")
        lines.append("This answer is based only on the current ontology data and rules. It is not veterinary diagnosis.")

    return "\n".join(lines)
