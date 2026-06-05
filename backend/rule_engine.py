"""
Rule Engine — 基于 YAML 规则对 graph payload 执行条件检查，生成 TRIGGERS_RISK 边。
不调用 LLM，不做兽医诊断，只做数据驱动的成分/营养风险评估。
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

    def evaluate_product(
        self,
        product: dict[str, Any],
        ingredient_names: list[str],
    ) -> list[dict]:
        """
        对单个产品评估所有规则，返回触发的 TRIGGERS_RISK 边列表。

        Args:
            product: 产品节点的 properties dict
            ingredient_names: 该产品的成分名称列表 (已 lowercased)

        Returns:
            [{"target": rule_id, "properties": {severity, evidence, reason}}, ...]
        """
        triggers: list[dict] = []

        for rule_key, rule in self.rules.items():
            condition = rule.get("condition", {})
            ctype = condition.get("type")

            triggered = False
            evidence = ""

            if ctype == "nutrition_threshold":
                triggered, evidence = self._check_nutrition_threshold(product, condition)

            elif ctype == "ingredient_absence":
                triggered, evidence = self._check_ingredient_absence(
                    product, ingredient_names, condition
                )

            elif ctype == "ingredient_match":
                triggered, evidence = self._check_ingredient_match(
                    ingredient_names, condition
                )

            elif ctype == "compound":
                triggered, evidence = self._check_compound(
                    product, ingredient_names, condition
                )

            if triggered:
                rule_id = rule.get("rule_id")
                if not rule_id:
                    import warnings
                    warnings.warn(f"Rule '{rule_key}' has no rule_id in rules.yaml, skipping")
                    continue

                triggers.append({
                    "target": rule_id,
                    "properties": {
                        "severity": rule.get("severity", "medium"),
                        "evidence": evidence,
                        "reason": rule.get("explanation", ""),
                    },
                })

        return triggers

    def apply_rules(self, payload: dict) -> dict:
        """
        对整个 graph payload 执行规则，返回增强后的 payload。
        在现有 edges 基础上追加 TRIGGERS_RISK 边。

        Args:
            payload: {"nodes": [...], "edges": [...]}

        Returns:
            增强后的 {"nodes": [...], "edges": [...]}
        """
        # 建立索引
        product_nodes = [n for n in payload["nodes"] if n["label"] == "PetFoodProduct"]
        ingredient_ids_by_name: dict[str, str] = {}
        for n in payload["nodes"]:
            if n["label"] == "Ingredient":
                name = n["properties"].get("ingredient_name", "").lower().strip()
                ingredient_ids_by_name[name] = n["id"]

        # 建立 product -> ingredient_names 映射
        product_ingredients: dict[str, list[str]] = {n["id"]: [] for n in product_nodes}
        for e in payload["edges"]:
            if e["type"] == "CONTAINS":
                pid = e["source"]
                iid = e["target"]
                # 通过 ingredient_id 查名称
                for n in payload["nodes"]:
                    if n["label"] == "Ingredient" and n["id"] == iid:
                        name = n["properties"].get("ingredient_name", "").lower().strip()
                        if pid in product_ingredients:
                            product_ingredients[pid].append(name)
                        break

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

    # ---- 内部规则检查 ----

    @staticmethod
    def _check_nutrition_threshold(
        product: dict, condition: dict
    ) -> tuple[bool, str]:
        field = condition["field"]
        operator = condition["operator"]
        threshold = condition["value"]
        value = product.get(field)

        if value is None:
            return False, ""

        op_func = OPERATORS.get(operator)
        if not op_func:
            return False, ""

        if op_func(value, threshold):
            return True, f"{field}={value} {operator} {threshold}"
        return False, ""

    @staticmethod
    def _check_ingredient_absence(
        product: dict, ingredient_names: list[str], condition: dict
    ) -> tuple[bool, str]:
        target_species = condition.get("target_species")
        missing_ingredient = condition.get("missing_ingredient", "")

        if target_species and product.get("target_species") != target_species:
            return False, ""

        if missing_ingredient.lower() not in ingredient_names:
            return True, f"target_species={target_species}, ingredients do not include {missing_ingredient}"
        return False, ""

    @staticmethod
    def _check_ingredient_match(
        ingredient_names: list[str], condition: dict
    ) -> tuple[bool, str]:
        match_ingredients = condition.get("match_ingredients", [])
        for mi in match_ingredients:
            if mi.lower() in ingredient_names:
                return True, f"contains ingredient: {mi}"
        return False, ""

    def _check_compound(
        self,
        product: dict,
        ingredient_names: list[str],
        condition: dict,
    ) -> tuple[bool, str]:
        # 检查 species 条件
        target_species = condition.get("target_species")
        if target_species and product.get("target_species") != target_species:
            return False, ""

        # 检查 life_stage 条件
        life_stage = condition.get("life_stage")
        if life_stage and product.get("life_stage") != life_stage:
            return False, ""

        # 检查营养阈值
        nutrition_cond = condition.get("nutrition_threshold")
        if nutrition_cond:
            triggered, evidence = self._check_nutrition_threshold(product, nutrition_cond)
            if not triggered:
                return False, ""
            # 组合 evidence
            parts = [f"target_species={target_species}"]
            if life_stage:
                parts.append(f"life_stage={life_stage}")
            parts.append(evidence)
            return True, ", ".join(parts)

        return False, ""

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
