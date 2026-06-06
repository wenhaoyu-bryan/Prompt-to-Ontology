"""
Rule Engine — 基于 YAML 规则对 graph payload 执行条件检查，生成 TRIGGERS_RISK 边。
不调用 LLM，不做兽医诊断，只做数据驱动的成分/营养风险评估。

Phase 20: 增加 not_evaluable / not_applicable 状态，区分"安全"和"无法评估"。
"""

from typing import Any
from ontology_registry import OntologyRegistry


# 操作符映射
OPERATORS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


class RuleEngine:
    """从 OntologyRegistry 加载 rules.yaml 并执行规则评估。"""

    def __init__(self, registry: OntologyRegistry):
        self.registry = registry
        self.rules = registry.load_rules().get("rules", {})

    # ================================================================
    # Public API — Phase 20
    # ================================================================

    def evaluate_product_full(
        self,
        product: dict[str, Any],
        ingredient_names: list[str],
    ) -> list[dict]:
        """
        对单个产品评估所有规则，返回完整的评估结果列表。

        Returns:
            [{"rule_id", "rule_key", "status", "severity", "evidence", "reason",
              "missing_fields", "missing_relations"}, ...]
        """
        results: list[dict] = []

        for rule_key, rule in self.rules.items():
            rule_id = rule.get("rule_id")
            if not rule_id:
                continue

            condition = rule.get("condition", {})
            ctype = condition.get("type")
            severity = rule.get("severity", "medium")
            reason = rule.get("explanation", "")

            result = self._evaluate_condition(product, ingredient_names, ctype, condition)

            results.append({
                "rule_id": rule_id,
                "rule_key": rule_key,
                "status": result["status"],
                "severity": severity,
                "evidence": result.get("evidence", ""),
                "reason": reason,
                "missing_fields": result.get("missing_fields", []),
                "missing_relations": result.get("missing_relations", []),
            })

        return results

    def evaluate_product(
        self,
        product: dict[str, Any],
        ingredient_names: list[str],
    ) -> list[dict]:
        """
        对单个产品评估所有规则，只返回 triggered 的 TRIGGERS_RISK 边列表。
        保持向后兼容。

        Returns:
            [{"target": rule_id, "properties": {severity, evidence, reason}}, ...]
        """
        triggers: list[dict] = []

        for rule_result in self.evaluate_product_full(product, ingredient_names):
            if rule_result["status"] == "triggered":
                triggers.append({
                    "target": rule_result["rule_id"],
                    "properties": {
                        "severity": rule_result["severity"],
                        "evidence": rule_result["evidence"],
                        "reason": rule_result["reason"],
                    },
                })

        return triggers

    def evaluate_payload(self, payload: dict) -> dict:
        """
        对整个 payload 中所有产品执行规则评估，返回完整评估报告。

        Returns:
            {"products": {product_id: {triggered, passed, not_evaluable, not_applicable}},
             "summary": {triggered_count, passed_count, not_evaluable_count, not_applicable_count}}
        """
        product_nodes = [n for n in payload["nodes"] if n["label"] == "PetFoodProduct"]
        product_ingredients = self._build_product_ingredients(payload)

        products: dict[str, dict] = {}
        summary = {"triggered_count": 0, "passed_count": 0, "not_evaluable_count": 0, "not_applicable_count": 0}

        for product in product_nodes:
            pid = product["id"]
            ing_names = product_ingredients.get(pid, [])
            full = self.evaluate_product_full(product["properties"], ing_names)

            bucket: dict[str, list] = {"triggered": [], "passed": [], "not_evaluable": [], "not_applicable": []}
            for r in full:
                status = r["status"]
                bucket[status].append({
                    "rule_id": r["rule_id"],
                    "rule_key": r["rule_key"],
                    "severity": r["severity"],
                    "evidence": r["evidence"],
                    "reason": r["reason"],
                    "missing_fields": r["missing_fields"],
                    "missing_relations": r["missing_relations"],
                })
                summary[f"{status}_count"] += 1

            products[pid] = bucket

        return {"products": products, "summary": summary}

    def apply_rules(self, payload: dict) -> dict:
        """
        对整个 graph payload 执行规则，返回增强后的 payload。
        在现有 edges 基础上追加 TRIGGERS_RISK 边。

        Args:
            payload: {"nodes": [...], "edges": [...]}

        Returns:
            增强后的 {"nodes": [...], "edges": [...]}
        """
        product_nodes = [n for n in payload["nodes"] if n["label"] == "PetFoodProduct"]
        product_ingredients = self._build_product_ingredients(payload)

        # 已有的 TRIGGERS_RISK 边集合，避免重复
        existing_triggers = set()
        for e in payload["edges"]:
            if e["type"] == "TRIGGERS_RISK":
                existing_triggers.add((e["source"], e["target"]))

        # 执行规则
        new_edges = []
        for product in product_nodes:
            pid = product["id"]
            ing_names = product_ingredients.get(pid, [])
            triggers = self.evaluate_product(product["properties"], ing_names)

            for t in triggers:
                key = (pid, t["target"])
                if key not in existing_triggers:
                    existing_triggers.add(key)
                    new_edges.append({
                        "source": pid,
                        "target": t["target"],
                        "type": "TRIGGERS_RISK",
                        "properties": t["properties"],
                    })

        enhanced = {
            "nodes": list(payload["nodes"]),
            "edges": list(payload["edges"]) + new_edges,
        }
        return enhanced

    # ================================================================
    # Internal — condition dispatcher
    # ================================================================

    def _evaluate_condition(
        self,
        product: dict,
        ingredient_names: list[str],
        ctype: str,
        condition: dict,
    ) -> dict:
        """Dispatch to the appropriate _full checker. Returns {status, evidence, ...}."""
        if ctype == "nutrition_threshold":
            return self._check_nutrition_threshold_full(product, condition)

        elif ctype == "ingredient_absence":
            return self._check_ingredient_absence_full(product, ingredient_names, condition)

        elif ctype == "ingredient_match":
            return self._check_ingredient_match_full(ingredient_names, condition)

        elif ctype == "compound":
            return self._check_compound_full(product, ingredient_names, condition)

        return {"status": "passed", "evidence": ""}

    # ================================================================
    # Internal — full-check methods (Phase 20)
    # ================================================================

    @staticmethod
    def _check_nutrition_threshold_full(product: dict, condition: dict) -> dict:
        field = condition["field"]
        operator = condition["operator"]
        threshold = condition["value"]
        value = product.get(field)

        if value is None:
            return {
                "status": "not_evaluable",
                "evidence": f"{field} is missing",
                "missing_fields": [field],
            }

        op_func = OPERATORS.get(operator)
        if not op_func:
            return {"status": "passed", "evidence": f"unknown operator '{operator}'"}

        if op_func(value, threshold):
            return {
                "status": "triggered",
                "evidence": f"{field}={value} {operator} {threshold}",
            }
        return {
            "status": "passed",
            "evidence": f"{field}={value} does not meet {operator} {threshold}",
        }

    @staticmethod
    def _check_ingredient_absence_full(
        product: dict, ingredient_names: list[str], condition: dict,
    ) -> dict:
        target_species = condition.get("target_species")
        missing_ingredient = condition.get("missing_ingredient", "")

        if target_species and product.get("target_species") != target_species:
            return {
                "status": "not_applicable",
                "evidence": f"target_species={product.get('target_species')}, rule requires {target_species}",
            }

        if not ingredient_names:
            return {
                "status": "not_evaluable",
                "evidence": "ingredient list is empty or missing",
                "missing_relations": ["CONTAINS"],
            }

        if missing_ingredient.lower() not in ingredient_names:
            return {
                "status": "triggered",
                "evidence": f"target_species={target_species}, ingredients do not include {missing_ingredient}",
            }
        return {
            "status": "passed",
            "evidence": f"ingredients include {missing_ingredient}",
        }

    @staticmethod
    def _check_ingredient_match_full(ingredient_names: list[str], condition: dict) -> dict:
        match_ingredients = condition.get("match_ingredients", [])
        for mi in match_ingredients:
            if mi.lower() in ingredient_names:
                return {
                    "status": "triggered",
                    "evidence": f"contains ingredient: {mi}",
                }
        return {
            "status": "passed",
            "evidence": f"none of {match_ingredients} found",
        }

    def _check_compound_full(
        self,
        product: dict,
        ingredient_names: list[str],
        condition: dict,
    ) -> dict:
        # 检查 species 条件
        target_species = condition.get("target_species")
        if target_species and product.get("target_species") != target_species:
            return {
                "status": "not_applicable",
                "evidence": f"target_species={product.get('target_species')}, rule requires {target_species}",
            }

        # 检查 life_stage 条件
        life_stage = condition.get("life_stage")
        if life_stage and product.get("life_stage") != life_stage:
            return {
                "status": "not_applicable",
                "evidence": f"life_stage={product.get('life_stage')}, rule requires {life_stage}",
            }

        # 检查营养阈值
        nutrition_cond = condition.get("nutrition_threshold")
        if nutrition_cond:
            sub = self._check_nutrition_threshold_full(product, nutrition_cond)

            if sub["status"] == "not_evaluable":
                # Compound 条件已满足（species + life_stage），但营养数据缺失
                parts = [f"target_species={target_species}"]
                if life_stage:
                    parts.append(f"life_stage={life_stage}")
                return {
                    "status": "not_evaluable",
                    "evidence": ", ".join(parts) + f", {sub['evidence']}",
                    "missing_fields": sub.get("missing_fields", []),
                }

            if sub["status"] == "passed":
                return {
                    "status": "passed",
                    "evidence": sub["evidence"],
                }

            if sub["status"] == "triggered":
                parts = [f"target_species={target_species}"]
                if life_stage:
                    parts.append(f"life_stage={life_stage}")
                parts.append(sub["evidence"])
                return {
                    "status": "triggered",
                    "evidence": ", ".join(parts),
                }

        return {"status": "passed", "evidence": ""}

    # ================================================================
    # Internal — helpers
    # ================================================================

    @staticmethod
    def _build_product_ingredients(payload: dict) -> dict[str, list[str]]:
        """Build {product_id: [ingredient_name, ...]} mapping from payload."""
        product_ingredients: dict[str, list[str]] = {}
        for n in payload["nodes"]:
            if n["label"] == "PetFoodProduct":
                product_ingredients[n["id"]] = []

        ingredient_name_by_id: dict[str, str] = {}
        for n in payload["nodes"]:
            if n["label"] == "Ingredient":
                ingredient_name_by_id[n["id"]] = n["properties"].get("ingredient_name", "").lower().strip()

        for e in payload["edges"]:
            if e["type"] == "CONTAINS":
                pid = e["source"]
                iid = e["target"]
                name = ingredient_name_by_id.get(iid)
                if name and pid in product_ingredients:
                    product_ingredients[pid].append(name)

        return product_ingredients


if __name__ == "__main__":
    from pathlib import Path

    sample_dir = Path(__file__).resolve().parent.parent / "sample-data" / "pet-food"
    from domain.petfood_transformer import transform

    payload = transform(sample_dir)
    registry = OntologyRegistry("pet_food")
    engine = RuleEngine(registry)

    enhanced = engine.apply_rules(payload)
    trigger_edges = [e for e in enhanced["edges"] if e["type"] == "TRIGGERS_RISK"]

    print(f"\nTotal TRIGGERS_RISK edges: {len(trigger_edges)}\n")
    for e in trigger_edges:
        props = e["properties"]
        print(f"  {e['source']} -> {e['target']}")
        print(f"    severity: {props['severity']}")
        print(f"    evidence: {props['evidence']}")
        print(f"    reason:   {props['reason']}")
        print()

    # Phase 20: evaluate_payload
    report = engine.evaluate_payload(payload)
    print(f"\nEvaluation Summary: {report['summary']}\n")
    for pid, evals in report["products"].items():
        ne = evals["not_evaluable"]
        na = evals["not_applicable"]
        if ne or na:
            print(f"  {pid}: triggered={len(evals['triggered'])}, passed={len(evals['passed'])}, "
                  f"not_evaluable={len(ne)}, not_applicable={len(na)}")
            for e in ne:
                print(f"    NE: {e['rule_id']} — {e['evidence']}")
