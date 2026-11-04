"""
Rule Engine — 基于 YAML 规则对 graph payload 执行条件检查，生成 TRIGGERS_RISK 边。
不调用 LLM，不做兽医诊断，只做数据驱动的成分/营养风险评估。

Phase 20: 增加 not_evaluable / not_applicable 状态，区分"安全"和"无法评估"。
"""

from math import isfinite
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


def _finite_number(value: Any) -> bool:
    return type(value) is int or (type(value) is float and isfinite(value))


def _nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_condition(condition: Any) -> None:
    if not isinstance(condition, dict):
        raise ValueError("condition must be a mapping")
    kind = condition.get("type")
    if kind not in ("nutrition_threshold", "ingredient_absence", "ingredient_match", "compound"):
        raise ValueError(f"unsupported condition type {kind!r}")
    if kind in ("nutrition_threshold", "compound"):
        threshold = condition if kind == "nutrition_threshold" else condition.get("nutrition_threshold")
        if not isinstance(threshold, dict) or not _nonempty_text(threshold.get("field")):
            raise ValueError("nutrition threshold requires a field")
        operator = threshold.get("operator")
        if not isinstance(operator, str) or operator not in OPERATORS:
            raise ValueError(f"unsupported operator {operator!r}")
        if not _finite_number(threshold.get("value")):
            raise ValueError("nutrition threshold value must be a finite number")
    if kind == "ingredient_absence" and not _nonempty_text(condition.get("missing_ingredient")):
        raise ValueError("ingredient absence requires missing_ingredient")
    if kind == "ingredient_match":
        names = condition.get("match_ingredients")
        if not isinstance(names, list) or not names or not all(map(_nonempty_text, names)):
            raise ValueError("ingredient match requires a nonempty list of ingredient names")
    for field in ("target_species", "life_stage"):
        if field in condition and not _nonempty_text(condition[field]):
            raise ValueError(f"{field} must be nonempty text")


def _check_scope(product: dict, condition: dict, fields: tuple[str, ...]) -> dict | None:
    missing = []
    for field in fields:
        expected = condition.get(field)
        if expected is None:
            continue
        actual = product.get(field)
        if not _nonempty_text(actual) or actual.strip().lower() == "unknown":
            missing.append(field)
        elif actual != expected:
            return {
                "status": "not_applicable",
                "evidence": f"{field}={actual}, rule requires {expected}",
            }
    if missing:
        return {
            "status": "not_evaluable",
            "evidence": f"Missing applicability fields: {', '.join(missing)}",
            "missing_fields": missing,
        }
    return None


def _incomplete_ingredients() -> dict:
    return {
        "status": "not_evaluable",
        "evidence": "Ingredient list completeness has not been confirmed",
        "missing_relations": ["CONTAINS"],
    }


class RuleEngine:
    """从 OntologyRegistry 加载 rules.yaml 并执行规则评估。"""

    def __init__(self, registry: OntologyRegistry):
        self.registry = registry
        document = registry.load_rules()
        if not isinstance(document, dict) or not isinstance(document.get("rules", {}), dict):
            raise ValueError("rules.yaml must define rules as a mapping")
        self.rules = document.get("rules", {})
        for key, rule in self.rules.items():
            if not isinstance(rule, dict) or not _nonempty_text(rule.get("rule_id")):
                raise ValueError(f"Rule {key!r}: rule_id is required")
            try:
                _validate_condition(rule.get("condition"))
            except ValueError as error:
                raise ValueError(f"Rule {key!r}: {error}") from error

    # ================================================================
    # Public API — Phase 20
    # ================================================================

    def evaluate_product_full(
        self,
        product: dict[str, Any],
        ingredient_names: list[str],
        *,
        ingredients_complete: bool = False,
    ) -> list[dict]:
        """
        对单个产品评估所有规则，返回完整的评估结果列表。

        Returns:
            [{"rule_id", "rule_key", "status", "severity", "evidence", "reason",
              "missing_fields", "missing_relations"}, ...]
        """
        results: list[dict] = []
        # Blank entries invalidate completeness, but known names remain evidence.
        names = [name.strip().lower() for name in ingredient_names if _nonempty_text(name)]
        complete = ingredients_complete is True and len(names) == len(ingredient_names)

        for rule_key, rule in self.rules.items():
            rule_id = rule["rule_id"]
            condition = rule["condition"]
            ctype = condition["type"]
            severity = rule.get("severity", "medium")
            reason = rule.get("explanation", "")

            result = self._evaluate_condition(product, names, ctype, condition, complete)

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
        ingredients_complete: bool,
    ) -> dict:
        """Dispatch to the appropriate _full checker. Returns {status, evidence, ...}."""
        if ctype == "nutrition_threshold":
            return self._check_nutrition_threshold_full(product, condition)

        elif ctype == "ingredient_absence":
            return self._check_ingredient_absence_full(product, ingredient_names, condition, ingredients_complete)

        elif ctype == "ingredient_match":
            return self._check_ingredient_match_full(ingredient_names, condition, ingredients_complete)

        elif ctype == "compound":
            return self._check_compound_full(product, ingredient_names, condition)

        raise ValueError(f"Unsupported condition type {ctype!r}")

    # ================================================================
    # Internal — full-check methods (Phase 20)
    # ================================================================

    @staticmethod
    def _check_nutrition_threshold_full(product: dict, condition: dict) -> dict:
        field = condition["field"]
        operator = condition["operator"]
        threshold = condition["value"]
        value = product.get(field)

        if not _finite_number(value):
            return {
                "status": "not_evaluable",
                "evidence": f"{field} is missing" if value is None else f"{field} must be a finite number",
                "missing_fields": [field],
            }

        if OPERATORS[operator](value, threshold):
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
        ingredients_complete: bool,
    ) -> dict:
        target_species = condition.get("target_species")
        missing_ingredient = condition["missing_ingredient"].strip().lower()
        scope_result = _check_scope(product, condition, ("target_species",))
        if scope_result:
            return scope_result
        if missing_ingredient in ingredient_names:
            return {"status": "passed", "evidence": f"ingredients include {missing_ingredient}"}
        if not ingredients_complete:
            return _incomplete_ingredients()
        return {
            "status": "triggered",
            "evidence": f"target_species={target_species}, ingredients do not include {missing_ingredient}",
        }

    @staticmethod
    def _check_ingredient_match_full(
        ingredient_names: list[str], condition: dict, ingredients_complete: bool,
    ) -> dict:
        match_ingredients = condition["match_ingredients"]
        for mi in match_ingredients:
            if mi.strip().lower() in ingredient_names:
                return {
                    "status": "triggered",
                    "evidence": f"contains ingredient: {mi}",
                }
        if not ingredients_complete:
            return _incomplete_ingredients()
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
        scope_fields = ("target_species", "life_stage")
        scope_result = _check_scope(product, condition, scope_fields)
        if scope_result:
            return scope_result
        result = self._check_nutrition_threshold_full(product, condition["nutrition_threshold"])
        if result["status"] != "passed":
            scope = [f"{field}={condition[field]}" for field in scope_fields if field in condition]
            result["evidence"] = ", ".join([*scope, result["evidence"]])
        return result

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
