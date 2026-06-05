"""
Pet Food Agent — 基于图谱证据链回答宠物食品问题。
不依赖 LLM 幻觉，优先使用 Neo4j 查询结果作为证据。
LLM 可选用于生成更自然的语言，但核心数据来自图谱。
"""

import os
import time
from neo4j_connector import get_driver

SYSTEM_PROMPT = """你是 Pet Food Ontology Agent。
你基于图数据库中的 PetFoodProduct、Brand、Ingredient、RiskRule 等对象回答问题。
你必须优先使用图谱证据链回答：
- 产品是什么
- 它有哪些关键成分
- 它有哪些营养属性
- 它触发了哪些 RiskRule
- 触发原因和 evidence 是什么
- 给出非医疗性质的选购解释
你不能做兽医诊断。
你不能声称替代兽医建议。
如果数据不足，你需要明确说明数据不足。"""


def _ts():
    return time.strftime("%H:%M:%S", time.localtime())


# =====================================================
# 图谱查询工具
# =====================================================

def get_product_risk_explanation(product_id: str = None, product_name: str = None) -> dict:
    """查询产品的完整风险解释。"""
    driver = get_driver()
    with driver.session() as session:
        if product_id:
            result = session.run(
                "MATCH (p:PetFoodProduct {id: $pid}) RETURN p", pid=product_id
            )
        elif product_name:
            result = session.run(
                "MATCH (p:PetFoodProduct) WHERE toLower(p.product_name) CONTAINS toLower($name) RETURN p",
                name=product_name,
            )
        else:
            return {"error": "需要 product_id 或 product_name"}

        record = result.single()
        if not record:
            return {"error": f"产品未找到: {product_id or product_name}"}

        product = dict(record["p"])
        pid = product["id"]

        # Brand
        brand_r = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[:MADE_BY]->(b:Brand) RETURN b", pid=pid
        ).single()
        brand = dict(brand_r["b"]) if brand_r else {}

        # Ingredients
        ings_r = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[c:CONTAINS]->(i:Ingredient) "
            "RETURN i, c.ingredient_order AS ord ORDER BY ord", pid=pid
        )
        ingredients = []
        for r in ings_r:
            ing = dict(r["i"])
            ing["order"] = r["ord"]
            ingredients.append(ing)

        # Risks
        risks_r = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[e:TRIGGERS_RISK]->(r:RiskRule) "
            "RETURN r, e.severity AS sev, e.evidence AS ev, e.reason AS rea", pid=pid
        )
        risks = []
        for r in risks_r:
            rule = dict(r["r"])
            risks.append({
                "rule_id": rule.get("rule_id"),
                "rule_name": rule.get("rule_name"),
                "severity": r["sev"],
                "evidence": r["ev"],
                "reason": r["rea"],
                "explanation": rule.get("explanation"),
            })

    return {"product": product, "brand": brand, "ingredients": ingredients, "risks": risks}


def find_products_by_ingredient(ingredient_name: str) -> list[dict]:
    """查找包含某成分的所有产品。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct)-[:CONTAINS]->(i:Ingredient) "
            "WHERE toLower(i.ingredient_name) = toLower($name) "
            "RETURN p.id AS id, p.product_name AS name, p.target_species AS species, p.life_stage AS stage "
            "ORDER BY p.product_name",
            name=ingredient_name,
        )
        return [r.data() for r in result]


def find_products_by_species(target_species: str) -> list[dict]:
    """查找面向某物种的所有产品。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct) WHERE p.target_species = $species "
            "OPTIONAL MATCH (p)-[:MADE_BY]->(b:Brand) "
            "RETURN p.id AS id, p.product_name AS name, b.brand_name AS brand, p.life_stage AS stage "
            "ORDER BY p.product_name",
            species=target_species,
        )
        return [r.data() for r in result]


def find_high_risk_products() -> list[dict]:
    """查找所有触发了风险规则的产品。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct)-[e:TRIGGERS_RISK]->(r:RiskRule) "
            "RETURN p.id AS id, p.product_name AS name, "
            "r.rule_name AS rule, e.severity AS severity, e.evidence AS evidence "
            "ORDER BY e.severity DESC, p.product_name"
        )
        return [r.data() for r in result]


def find_products_without_ingredient(ingredient_name: str) -> list[dict]:
    """查找不含某成分的所有产品（用于过敏规避查询）。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct) "
            "WHERE NOT EXISTS { "
            "  MATCH (p)-[:CONTAINS]->(i:Ingredient) "
            "  WHERE toLower(i.ingredient_name) = toLower($name) "
            "} "
            "OPTIONAL MATCH (p)-[:MADE_BY]->(b:Brand) "
            "RETURN p.id AS id, p.product_name AS name, p.target_species AS species, "
            "b.brand_name AS brand, p.life_stage AS stage "
            "ORDER BY p.product_name",
            name=ingredient_name,
        )
        return [r.data() for r in result]


def find_cat_foods_missing_taurine() -> list[dict]:
    """查找缺少牛磺酸的猫粮。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct)-[e:TRIGGERS_RISK]->(r:RiskRule {rule_id: 'RR002'}) "
            "RETURN p.id AS id, p.product_name AS name, e.evidence AS evidence, e.reason AS reason"
        )
        return [r.data() for r in result]


def find_senior_cat_high_phosphorus() -> list[dict]:
    """查找磷含量偏高的老年猫粮。"""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(
            "MATCH (p:PetFoodProduct)-[e:TRIGGERS_RISK]->(r:RiskRule {rule_id: 'RR004'}) "
            "RETURN p.id AS id, p.product_name AS name, p.phosphorus_100g AS phosphorus, "
            "e.evidence AS evidence, e.reason AS reason"
        )
        return [r.data() for r in result]


def compare_products(product_id_1: str, product_id_2: str) -> dict:
    """比较两个产品的风险差异。"""
    p1 = get_product_risk_explanation(product_id=product_id_1)
    p2 = get_product_risk_explanation(product_id=product_id_2)

    if "error" in p1:
        return {"error": f"产品1: {p1['error']}"}
    if "error" in p2:
        return {"error": f"产品2: {p2['error']}"}

    return {
        "product_1": {
            "id": p1["product"]["id"],
            "name": p1["product"].get("product_name"),
            "brand": p1["brand"].get("brand_name"),
            "species": p1["product"].get("target_species"),
            "stage": p1["product"].get("life_stage"),
            "nutrition": {
                "protein": p1["product"].get("protein_100g"),
                "fat": p1["product"].get("fat_100g"),
                "phosphorus": p1["product"].get("phosphorus_100g"),
            },
            "ingredient_count": len(p1["ingredients"]),
            "risks": p1["risks"],
        },
        "product_2": {
            "id": p2["product"]["id"],
            "name": p2["product"].get("product_name"),
            "brand": p2["brand"].get("brand_name"),
            "species": p2["product"].get("target_species"),
            "stage": p2["product"].get("life_stage"),
            "nutrition": {
                "protein": p2["product"].get("protein_100g"),
                "fat": p2["product"].get("fat_100g"),
                "phosphorus": p2["product"].get("phosphorus_100g"),
            },
            "ingredient_count": len(p2["ingredients"]),
            "risks": p2["risks"],
        },
    }


# =====================================================
# 问题路由：根据问题选择工具
# =====================================================

def _route_question(question: str) -> tuple[str, dict]:
    """简单的关键词路由，不依赖 LLM。"""
    q = question.lower()

    # 比较产品
    if "比较" in q or "compare" in q:
        # 尝试提取两个产品 ID
        import re
        ids = re.findall(r'PF\d+', question.upper())
        if len(ids) >= 2:
            return "compare", {"product_id_1": ids[0], "product_id_2": ids[1]}
        return "compare", {}

    # 缺少牛磺酸
    if "taurine" in q or "牛磺酸" in q:
        return "cat_foods_missing_taurine", {}

    # 高磷
    if ("phosphorus" in q or "磷" in q) and ("senior" in q or "老年" in q or "老" in q):
        return "senior_cat_high_phosphorus", {}

    # 过敏规避（不含某成分）
    if "避开" in q or "过敏" in q or "allergen" in q or "allergy" in q or "避免" in q or "不含" in q or "without" in q:
        for word in ["chicken", "chicken meal", "salmon", "beef", "turkey", "rice", "corn", "wheat"]:
            if word in q:
                return "allergen_free", {"ingredient_name": word}
        if "鸡肉" in q or "chicken" in q:
            return "allergen_free", {"ingredient_name": "chicken"}
        return "allergen_free", {"ingredient_name": "chicken"}

    # 含某成分
    if "含" in q or "contain" in q or "chicken" in q or "鸡肉" in q:
        # 提取成分名
        for word in ["chicken", "chicken meal", "salmon", "beef", "turkey", "rice", "corn", "wheat"]:
            if word in q:
                return "by_ingredient", {"ingredient_name": word}
        return "by_ingredient", {"ingredient_name": "chicken"}

    # 高风险
    if "high risk" in q or "高风险" in q or "风险" in q:
        # 如果问的是某个具体产品
        import re
        ids = re.findall(r'PF\d+', question.upper())
        if ids:
            return "product_risk", {"product_id": ids[0]}
        # 如果问的是某个产品名
        return "high_risk", {}

    # 猫粮/狗粮
    if "猫粮" in q or "cat food" in q or "cat" in q:
        if "没有" in q or "缺" in q or "missing" in q:
            return "cat_foods_missing_taurine", {}
        return "by_species", {"target_species": "cat"}
    if "狗粮" in q or "dog food" in q or "dog" in q:
        return "by_species", {"target_species": "dog"}

    # 具体产品 ID
    import re
    ids = re.findall(r'PF\d+', question.upper())
    if ids:
        return "product_risk", {"product_id": ids[0]}

    # 默认：高风险产品列表
    return "high_risk", {}


def _format_evidence_answer(tool: str, result, question: str) -> dict:
    """将工具返回值格式化为结构化回答。"""
    logs = []
    step = 1

    logs.append({
        "step": step, "type": "thought", "icon": "🧠", "color": "orange",
        "message": f"分析问题: {question}\n路由到工具: {tool}",
        "timestamp": _ts(),
    })
    step += 1

    if tool == "product_risk" and isinstance(result, dict) and "product" in result:
        p = result["product"]
        brand = result.get("brand", {})
        risks = result.get("risks", [])
        ings = result.get("ingredients", [])

        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": (
                f"产品: {p.get('product_name')}\n"
                f"品牌: {brand.get('brand_name', '未知')}\n"
                f"物种: {p.get('target_species')} | 阶段: {p.get('life_stage')}\n"
                f"蛋白质: {p.get('protein_100g')}g | 脂肪: {p.get('fat_100g')}g | 磷: {p.get('phosphorus_100g')}g\n"
                f"成分: {', '.join(i.get('ingredient_name', '') for i in ings)}"
            ),
            "timestamp": _ts(),
        })
        step += 1

        if risks:
            for r in risks:
                logs.append({
                    "step": step, "type": "observation", "icon": "⚠️", "color": "amber",
                    "message": (
                        f"触发规则: {r['rule_name']} ({r['severity']})\n"
                        f"证据: {r['evidence']}\n"
                        f"原因: {r['reason']}"
                    ),
                    "timestamp": _ts(),
                })
                step += 1
        else:
            logs.append({
                "step": step, "type": "observation", "icon": "✅", "color": "green",
                "message": "该产品未触发任何风险规则。",
                "timestamp": _ts(),
            })
            step += 1

    elif tool == "by_ingredient" and isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"找到 {len(result)} 个产品:\n" + "\n".join(
                f"  - {r.get('name', r.get('id'))} ({r.get('species', '')})" for r in result
            ),
            "timestamp": _ts(),
        })
        step += 1

    elif tool == "high_risk" and isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"找到 {len(result)} 个高风险产品:\n" + "\n".join(
                f"  - {r.get('name')}: {r.get('rule')} ({r.get('severity')}) — {r.get('evidence', '')}"
                for r in result
            ),
            "timestamp": _ts(),
        })
        step += 1

    elif tool == "cat_foods_missing_taurine" and isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"找到 {len(result)} 个缺少牛磺酸的猫粮:\n" + "\n".join(
                f"  - {r.get('name')}: {r.get('evidence', '')}" for r in result
            ),
            "timestamp": _ts(),
        })
        step += 1

    elif tool == "senior_cat_high_phosphorus" and isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"找到 {len(result)} 个磷含量偏高的老年猫粮:\n" + "\n".join(
                f"  - {r.get('name')}: 磷 {r.get('phosphorus', '?')}g — {r.get('evidence', '')}" for r in result
            ),
            "timestamp": _ts(),
        })
        step += 1

    elif tool == "by_species" and isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"找到 {len(result)} 个产品:\n" + "\n".join(
                f"  - {r.get('name')} ({r.get('brand', '')}) — {r.get('stage', '')}" for r in result
            ),
            "timestamp": _ts(),
        })
        step += 1

    elif tool == "allergen_free" and isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"找到 {len(result)} 个不含该过敏原的产品:\n" + "\n".join(
                f"  - {r.get('name', r.get('id'))} ({r.get('species', '')})" for r in result
            ),
            "timestamp": _ts(),
        })
        step += 1

    elif tool == "compare" and isinstance(result, dict) and "product_1" in result:
        p1 = result["product_1"]
        p2 = result["product_2"]
        msg = (
            f"产品对比:\n"
            f"  {p1['name']} ({p1['brand']}) vs {p2['name']} ({p2['brand']})\n"
            f"  蛋白质: {p1['nutrition']['protein']}g vs {p2['nutrition']['protein']}g\n"
            f"  脂肪: {p1['nutrition']['fat']}g vs {p2['nutrition']['fat']}g\n"
            f"  风险数: {len(p1['risks'])} vs {len(p2['risks'])}"
        )
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": msg, "timestamp": _ts(),
        })
        step += 1

    elif isinstance(result, list):
        logs.append({
            "step": step, "type": "observation", "icon": "👁️", "color": "green",
            "message": f"查询结果: {len(result)} 条记录\n" + str(result[:5]),
            "timestamp": _ts(),
        })
        step += 1

    elif isinstance(result, dict) and "error" in result:
        logs.append({
            "step": step, "type": "error", "icon": "❌", "color": "red",
            "message": result["error"], "timestamp": _ts(),
        })
        step += 1

    # 注意事项
    logs.append({
        "step": step, "type": "thought", "icon": "📌", "color": "blue",
        "message": "注意: 以上回答基于当前样例数据和本体规则，不构成兽医诊断。数据可能不完整。",
        "timestamp": _ts(),
    })

    return {
        "logs": logs,
        "answer": _build_markdown_answer(tool, result, question),
    }


def _build_markdown_answer(tool: str, result, question: str) -> str:
    """构建 Markdown 格式的回答。"""
    lines = ["## 结论\n"]

    if tool == "product_risk" and isinstance(result, dict) and "product" in result:
        p = result["product"]
        risks = result.get("risks", [])
        brand = result.get("brand", {})
        if risks:
            lines.append(f"产品 **{p.get('product_name')}** 触发了 {len(risks)} 条风险规则。\n")
            lines.append("## 图谱证据\n")
            lines.append(f"- 产品: {p.get('product_name')} ({p.get('product_id')})")
            lines.append(f"- 品牌: {brand.get('brand_name', '未知')}")
            lines.append(f"- 物种: {p.get('target_species')} | 阶段: {p.get('life_stage')}")
            lines.append(f"- 蛋白质: {p.get('protein_100g')}g/100g | 脂肪: {p.get('fat_100g')}g/100g")
            lines.append("\n## 触发规则\n")
            for r in risks:
                lines.append(f"### {r['rule_name']} ({r['severity']})")
                lines.append(f"- 证据: {r['evidence']}")
                lines.append(f"- 原因: {r['reason']}")
                lines.append(f"- 说明: {r.get('explanation', '')}\n")
        else:
            lines.append(f"产品 **{p.get('product_name')}** 未触发任何风险规则。\n")

    elif tool == "by_ingredient" and isinstance(result, list):
        lines.append(f"找到 {len(result)} 个含该成分的产品。\n")
        lines.append("## 图谱证据\n")
        for r in result:
            lines.append(f"- {r.get('name', r.get('id'))} ({r.get('species', '')})")

    elif tool == "high_risk" and isinstance(result, list):
        lines.append(f"共 {len(result)} 个产品触发了风险规则。\n")
        lines.append("## 图谱证据\n")
        for r in result:
            lines.append(f"- **{r.get('name')}**: {r.get('rule')} ({r.get('severity')}) — {r.get('evidence', '')}")

    elif tool == "cat_foods_missing_taurine" and isinstance(result, list):
        if result:
            lines.append(f"找到 **{len(result)}** 个缺少牛磺酸的猫粮。\n")
            lines.append("## 图谱证据\n")
            for r in result:
                lines.append(f"- **{r.get('name')}** ({r.get('id')})")
                if r.get('evidence'):
                    lines.append(f"  - 证据: {r['evidence']}")
                if r.get('reason'):
                    lines.append(f"  - 原因: {r['reason']}")
            lines.append("\n## 触发规则\n")
            lines.append("- **RR002 缺少牛磺酸** — 猫粮必须含牛磺酸，缺乏会导致视网膜和心脏问题")
        else:
            lines.append("所有猫粮均含有牛磺酸，未触发此规则。\n")

    elif tool == "senior_cat_high_phosphorus" and isinstance(result, list):
        if result:
            lines.append(f"找到 **{len(result)}** 个磷含量偏高的老年猫粮。\n")
            lines.append("## 图谱证据\n")
            for r in result:
                lines.append(f"- **{r.get('name')}** ({r.get('id')}) — 磷 {r.get('phosphorus', '?')}g/100g")
                if r.get('evidence'):
                    lines.append(f"  - 证据: {r['evidence']}")
                if r.get('reason'):
                    lines.append(f"  - 原因: {r['reason']}")
            lines.append("\n## 触发规则\n")
            lines.append("- **RR004 老年猫高磷** — 老年猫应控制磷摄入以保护肾功能")
        else:
            lines.append("没有老年猫粮触发高磷规则。\n")

    elif tool == "by_species" and isinstance(result, list):
        lines.append(f"找到 **{len(result)}** 个产品。\n")
        lines.append("## 图谱证据\n")
        for r in result:
            lines.append(f"- **{r.get('name')}** ({r.get('brand', '')}) — {r.get('stage', '')}")

    elif tool == "allergen_free" and isinstance(result, list):
        lines.append(f"找到 **{len(result)}** 个不含常见过敏原的产品。\n")
        lines.append("## 图谱证据\n")
        for r in result:
            lines.append(f"- **{r.get('name', r.get('id'))}** ({r.get('species', '')})")

    elif tool == "compare" and isinstance(result, dict) and "product_1" in result:
        p1, p2 = result["product_1"], result["product_2"]
        lines.append(f"对比 {p1['name']} 和 {p2['name']}:\n")
        lines.append("## 图谱证据\n")
        lines.append(f"| 指标 | {p1['name']} | {p2['name']} |")
        lines.append("|------|------|------|")
        lines.append(f"| 品牌 | {p1['brand']} | {p2['brand']} |")
        lines.append(f"| 蛋白质 | {p1['nutrition']['protein']}g | {p2['nutrition']['protein']}g |")
        lines.append(f"| 脂肪 | {p1['nutrition']['fat']}g | {p2['nutrition']['fat']}g |")
        lines.append(f"| 风险数 | {len(p1['risks'])} | {len(p2['risks'])} |")

    else:
        lines.append("查询完成，请查看上方日志了解详情。\n")

    lines.append("\n## 注意\n")
    lines.append("以上回答基于当前样例数据和本体规则，不构成兽医诊断。数据可能不完整。")

    return "\n".join(lines)


# =====================================================
# 主入口
# =====================================================

def chat(question: str) -> dict:
    """
    Pet Food Agent 主入口。
    接收自然语言问题，路由到图谱查询工具，返回结构化回答。
    """
    tool, params = _route_question(question)

    tool_map = {
        "product_risk": lambda: get_product_risk_explanation(**params),
        "by_ingredient": lambda: find_products_by_ingredient(**params),
        "by_species": lambda: find_products_by_species(**params),
        "high_risk": lambda: find_high_risk_products(),
        "cat_foods_missing_taurine": lambda: find_cat_foods_missing_taurine(),
        "senior_cat_high_phosphorus": lambda: find_senior_cat_high_phosphorus(),
        "compare": lambda: compare_products(**params) if params else {"error": "需要两个产品 ID"},
        "allergen_free": lambda: find_products_without_ingredient(**params),
    }

    handler = tool_map.get(tool)
    if not handler:
        return {
            "logs": [{
                "step": 1, "type": "error", "icon": "❌", "color": "red",
                "message": f"无法识别问题意图: {question}",
                "timestamp": _ts(),
            }],
            "answer": "无法识别问题意图，请尝试更具体的问题。",
        }

    try:
        result = handler()
    except Exception as e:
        return {
            "logs": [{
                "step": 1, "type": "error", "icon": "❌", "color": "red",
                "message": f"查询失败: {str(e)}",
                "timestamp": _ts(),
            }],
            "answer": f"查询失败: {str(e)}",
        }

    return _format_evidence_answer(tool, result, question)
