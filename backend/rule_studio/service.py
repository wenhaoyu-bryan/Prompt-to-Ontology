"""
Rule Studio Service -- wraps the existing rule engine for studio views.

Provides rule listing, detail, coverage evaluation, per-product results,
and simulation. All reads go through the YAML schema + Neo4j graph;
simulation is stateless (no graph writes).
"""

from __future__ import annotations

from typing import Any

from neo4j_connector import get_driver
from ontology_kernel.models import OntologySchema, RuleDef
from ontology_kernel.schema_loader import load_pet_food_schema
from ontology_registry import OntologyRegistry
from rule_engine import RuleEngine

from .models import (
    EvaluationSummary,
    RuleCoverageByProduct,
    RuleCoverageByRule,
    RuleCoverageSummary,
    RuleDetail,
    RuleSummary,
    SimulationRequest,
    SimulationResult,
)

# ================================================================
# Singleton helpers
# ================================================================

_schema: OntologySchema | None = None
_registry: OntologyRegistry | None = None
_engine: RuleEngine | None = None


def _get_schema() -> OntologySchema:
    global _schema
    if _schema is None:
        _schema = load_pet_food_schema()
    return _schema


def _get_registry() -> OntologyRegistry:
    global _registry
    if _registry is None:
        _registry = OntologyRegistry("pet_food")
    return _registry


def _get_engine() -> RuleEngine:
    global _engine
    if _engine is None:
        _engine = RuleEngine(_get_registry())
    return _engine


def reset_cache() -> None:
    """Clear cached schema / registry / engine (e.g. after schema reload)."""
    global _schema, _registry, _engine
    _schema = None
    _registry = None
    _engine = None


# ================================================================
# Human-readable condition descriptions
# ================================================================

_OPERATOR_LABELS: dict[str, dict[str, str]] = {
    ">": {"en": "exceeds", "zh": "超过"},
    ">=": {"en": "is at least", "zh": "至少"},
    "<": {"en": "is below", "zh": "低于"},
    "<=": {"en": "is at most", "zh": "最多"},
    "==": {"en": "equals", "zh": "等于"},
    "!=": {"en": "does not equal", "zh": "不等于"},
}


def _build_condition_desc(rule: RuleDef) -> str:
    """Build a concise human-readable description of the rule condition."""
    ctype = rule.condition_type
    params = rule.condition_params

    if ctype == "nutrition_threshold":
        field = params.get("field", "")
        op = params.get("operator", "")
        value = params.get("value", "")
        return f"{field} {op} {value}"

    if ctype == "ingredient_absence":
        species = params.get("target_species", "any")
        ingredient = params.get("missing_ingredient", "")
        return f"target_species={species}, ingredient list does not include '{ingredient}'"

    if ctype == "ingredient_match":
        ingredients = params.get("match_ingredients", [])
        return f"ingredient list contains any of: {', '.join(ingredients)}"

    if ctype == "compound":
        parts: list[str] = []
        species = params.get("target_species")
        if species:
            parts.append(f"target_species={species}")
        life_stage = params.get("life_stage")
        if life_stage:
            parts.append(f"life_stage={life_stage}")
        sub = params.get("nutrition_threshold", {})
        if sub:
            parts.append(f"{sub.get('field', '')} {sub.get('operator', '')} {sub.get('value', '')}")
        return " AND ".join(parts)

    return str(params)


# ================================================================
# Required fields extraction
# ================================================================

def _extract_required_fields(rule: RuleDef) -> list[str]:
    """Extract the property/relation fields needed to evaluate this rule."""
    ctype = rule.condition_type
    params = rule.condition_params
    fields: list[str] = []

    if ctype == "nutrition_threshold":
        fields.append(params.get("field", ""))

    elif ctype == "ingredient_absence":
        if params.get("target_species"):
            fields.append("target_species")
        fields.append("CONTAINS (ingredient list)")

    elif ctype == "ingredient_match":
        fields.append("CONTAINS (ingredient list)")

    elif ctype == "compound":
        if params.get("target_species"):
            fields.append("target_species")
        if params.get("life_stage"):
            fields.append("life_stage")
        sub = params.get("nutrition_threshold", {})
        if sub.get("field"):
            fields.append(sub["field"])

    return [f for f in fields if f]


# ================================================================
# Logic explanation builder
# ================================================================

def _build_logic_explanation(rule: RuleDef) -> dict:
    """Build a structured logic explanation for a rule."""
    ctype = rule.condition_type
    params = rule.condition_params
    name = rule.name

    if ctype == "nutrition_threshold":
        field = params.get("field", "")
        op = params.get("operator", "")
        value = params.get("value", "")
        op_en = _OPERATOR_LABELS.get(op, {}).get("en", op)
        op_zh = _OPERATOR_LABELS.get(op, {}).get("zh", op)
        return {
            "plain_english": f"Triggered when {field} {op_en} {value}. The rule checks whether the product's {field} exceeds the safety threshold.",
            "plain_chinese": f"当 {field} {op_zh} {value} 时触发。此规则检查产品的 {field} 是否超过安全阈值。",
            "required_fields": [field],
            "applicability": "Applied to all products regardless of species or life stage.",
            "trigger_condition": f"{field} {op} {value}",
            "pass_condition": f"{field} does not {op_en} {value} (i.e. {field} <= {value})",
            "not_evaluable_reason": f"{field} is missing or null on the product node.",
        }

    if ctype == "ingredient_absence":
        species = params.get("target_species", "")
        ingredient = params.get("missing_ingredient", "")
        return {
            "plain_english": (
                f"Triggered when target_species is '{species}' AND the ingredient list "
                f"does NOT contain '{ingredient}'. Ensures {species} food includes {ingredient}."
            ),
            "plain_chinese": (
                f"当 target_species 为 '{species}' 且成分列表中不含 '{ingredient}' 时触发。"
                f"确保{species}粮含有{ingredient}。"
            ),
            "required_fields": ["target_species", "CONTAINS (ingredient list)"],
            "applicability": f"Only applies to products with target_species = '{species}'. Other species return not_applicable.",
            "trigger_condition": f"target_species = '{species}' AND '{ingredient}' not in ingredient list",
            "pass_condition": f"'{ingredient}' is present in the ingredient list",
            "not_evaluable_reason": "Ingredient list is empty or the CONTAINS relationship is missing.",
        }

    if ctype == "ingredient_match":
        ingredients = params.get("match_ingredients", [])
        ingredient_str = ", ".join(f"'{i}'" for i in ingredients)
        return {
            "plain_english": (
                f"Triggered when the ingredient list contains ANY of: {ingredient_str}. "
                f"Flags products that may cause allergy reactions."
            ),
            "plain_chinese": (
                f"当成分列表包含以下任一成分时触发: {ingredient_str}。"
                f"标记可能引起过敏反应的产品。"
            ),
            "required_fields": ["CONTAINS (ingredient list)"],
            "applicability": "Applied to all products regardless of species or life stage.",
            "trigger_condition": f"Any of [{ingredient_str}] found in ingredient list",
            "pass_condition": f"None of [{ingredient_str}] found in ingredient list",
            "not_evaluable_reason": "Ingredient list is empty or the CONTAINS relationship is missing.",
        }

    if ctype == "compound":
        species = params.get("target_species", "")
        life_stage = params.get("life_stage", "")
        sub = params.get("nutrition_threshold", {})
        sub_field = sub.get("field", "")
        sub_op = sub.get("operator", "")
        sub_value = sub.get("value", "")
        op_en = _OPERATOR_LABELS.get(sub_op, {}).get("en", sub_op)
        op_zh = _OPERATOR_LABELS.get(sub_op, {}).get("zh", sub_op)
        return {
            "plain_english": (
                f"Triggered when ALL of: target_species = '{species}', "
                f"life_stage = '{life_stage}', AND {sub_field} {op_en} {sub_value}. "
                f"Multi-condition check for species-specific nutritional risk."
            ),
            "plain_chinese": (
                f"当以下全部满足时触发: target_species = '{species}', "
                f"life_stage = '{life_stage}', 且 {sub_field} {op_zh} {sub_value}。"
                f"多条件检查特定物种的营养风险。"
            ),
            "required_fields": ["target_species", "life_stage", sub_field],
            "applicability": (
                f"Only applies to products with target_species = '{species}' "
                f"AND life_stage = '{life_stage}'. Others return not_applicable."
            ),
            "trigger_condition": (
                f"target_species = '{species}' AND life_stage = '{life_stage}' "
                f"AND {sub_field} {sub_op} {sub_value}"
            ),
            "pass_condition": f"{sub_field} does not {op_en} {sub_value} (i.e. {sub_field} {'>=' if sub_op == '<' else '<='} {sub_value})",
            "not_evaluable_reason": (
                f"Species and life_stage match but {sub_field} is missing or null."
            ),
        }

    return {
        "plain_english": f"Condition type: {ctype}. No automatic explanation available.",
        "plain_chinese": f"条件类型: {ctype}。暂无自动解释。",
        "required_fields": [],
        "applicability": "",
        "trigger_condition": "",
        "pass_condition": "",
        "not_evaluable_reason": "",
    }


# ================================================================
# Deterministic example builder
# ================================================================

def _build_examples(rule: RuleDef) -> dict:
    """Build deterministic mock examples that would trigger/pass/not_evaluable/not_applicable."""
    ctype = rule.condition_type
    params = rule.condition_params

    if ctype == "nutrition_threshold":
        field = params.get("field", "")
        op = params.get("operator", ">")
        value = params.get("value", 0)
        return {
            "triggered": {
                "description": f"Product with {field} above threshold",
                "mock_product": {field: value + 5},
                "mock_ingredients": [],
            },
            "passed": {
                "description": f"Product with {field} below threshold",
                "mock_product": {field: value - 5},
                "mock_ingredients": [],
            },
            "not_evaluable": {
                "description": f"Product with {field} missing",
                "mock_product": {},
                "mock_ingredients": [],
            },
            "not_applicable": {
                "description": "N/A -- nutrition_threshold applies to all products",
                "mock_product": {},
                "mock_ingredients": [],
            },
        }

    if ctype == "ingredient_absence":
        species = params.get("target_species", "")
        ingredient = params.get("missing_ingredient", "")
        return {
            "triggered": {
                "description": f"{species} food without {ingredient}",
                "mock_product": {"target_species": species},
                "mock_ingredients": ["chicken", "rice", "fish oil"],
            },
            "passed": {
                "description": f"{species} food with {ingredient} present",
                "mock_product": {"target_species": species},
                "mock_ingredients": ["chicken", "rice", ingredient],
            },
            "not_evaluable": {
                "description": f"{species} food with empty ingredient list",
                "mock_product": {"target_species": species},
                "mock_ingredients": [],
            },
            "not_applicable": {
                "description": f"Product with different target_species (e.g. dog)",
                "mock_product": {"target_species": "dog"},
                "mock_ingredients": ["chicken", "rice"],
            },
        }

    if ctype == "ingredient_match":
        ingredients = params.get("match_ingredients", [])
        return {
            "triggered": {
                "description": f"Product containing {ingredients[0] if ingredients else 'matched ingredient'}",
                "mock_product": {},
                "mock_ingredients": ["chicken", "rice", "fish oil"],
            },
            "passed": {
                "description": "Product without any matched ingredients",
                "mock_product": {},
                "mock_ingredients": ["salmon", "rice", "fish oil"],
            },
            "not_evaluable": {
                "description": "Product with empty ingredient list",
                "mock_product": {},
                "mock_ingredients": [],
            },
            "not_applicable": {
                "description": "N/A -- ingredient_match applies to all products",
                "mock_product": {},
                "mock_ingredients": [],
            },
        }

    if ctype == "compound":
        species = params.get("target_species", "")
        life_stage = params.get("life_stage", "")
        sub = params.get("nutrition_threshold", {})
        sub_field = sub.get("field", "")
        sub_value = sub.get("value", 0)
        return {
            "triggered": {
                "description": f"{species} {life_stage} food with {sub_field} above threshold",
                "mock_product": {"target_species": species, "life_stage": life_stage, sub_field: sub_value + 0.5},
                "mock_ingredients": [],
            },
            "passed": {
                "description": f"{species} {life_stage} food with {sub_field} below threshold",
                "mock_product": {"target_species": species, "life_stage": life_stage, sub_field: sub_value - 0.2},
                "mock_ingredients": [],
            },
            "not_evaluable": {
                "description": f"{species} {life_stage} food with {sub_field} missing",
                "mock_product": {"target_species": species, "life_stage": life_stage},
                "mock_ingredients": [],
            },
            "not_applicable": {
                "description": f"Product with wrong species or life_stage (e.g. dog, adult)",
                "mock_product": {"target_species": "dog", "life_stage": "adult"},
                "mock_ingredients": [],
            },
        }

    return {"triggered": {}, "passed": {}, "not_evaluable": {}, "not_applicable": {}}


# ================================================================
# Public API
# ================================================================


def list_rules() -> list[RuleSummary]:
    """Load schema and convert each RuleDef to a RuleSummary."""
    schema = _get_schema()
    summaries: list[RuleSummary] = []

    for _key, rule in schema.rules.items():
        summaries.append(
            RuleSummary(
                id=rule.rule_id,
                name=rule.name,
                description=rule.description,
                severity=rule.severity,
                target_type="PetFoodProduct",
                condition_type=rule.condition_type,
                condition_desc=_build_condition_desc(rule),
                required_fields=_extract_required_fields(rule),
                generated_link_type=rule.output_link_type,
            )
        )

    return summaries


def get_rule_detail(rule_id: str) -> RuleDetail:
    """Return rule detail with logic explanation and deterministic examples."""
    schema = _get_schema()

    # Find the rule by rule_id (the dict key is the rule_key, value has rule_id)
    target_rule: RuleDef | None = None
    for _key, rule in schema.rules.items():
        if rule.rule_id == rule_id:
            target_rule = rule
            break

    if target_rule is None:
        raise ValueError(f"Rule '{rule_id}' not found")

    summary = RuleSummary(
        id=target_rule.rule_id,
        name=target_rule.name,
        description=target_rule.description,
        severity=target_rule.severity,
        target_type="PetFoodProduct",
        condition_type=target_rule.condition_type,
        condition_desc=_build_condition_desc(target_rule),
        required_fields=_extract_required_fields(target_rule),
        generated_link_type=target_rule.output_link_type,
    )

    return RuleDetail(
        rule=summary,
        logic_explanation=_build_logic_explanation(target_rule),
        examples=_build_examples(target_rule),
    )


def get_evaluation_summary() -> EvaluationSummary:
    """Query Neo4j for all PetFoodProduct nodes, run rule evaluation, aggregate."""
    engine = _get_engine()
    driver = get_driver()

    # Fetch all products and their ingredient names
    products: list[dict] = []
    product_ingredients: dict[str, list[str]] = {}

    with driver.session() as session:
        # All PetFoodProduct nodes
        result = session.run(
            "MATCH (p:PetFoodProduct) RETURN p.id AS id, p.name AS name, p"
        )
        for record in result:
            pid = record["id"]
            product_node = dict(record["p"])
            products.append({"id": pid, "name": record["name"] or pid, "properties": product_node})
            product_ingredients[pid] = []

        # Ingredient relationships
        ing_result = session.run(
            "MATCH (p:PetFoodProduct)-[:CONTAINS]->(i:Ingredient) "
            "RETURN p.id AS pid, i.ingredient_name AS ingredient_name"
        )
        for record in ing_result:
            pid = record["pid"]
            name = (record["ingredient_name"] or "").lower().strip()
            if pid in product_ingredients and name:
                product_ingredients[pid].append(name)

    # Run evaluate_product_full for each product
    by_rule_data: dict[str, dict] = {}
    by_product_list: list[RuleCoverageByProduct] = []

    for prod in products:
        pid = prod["id"]
        ing_names = product_ingredients.get(pid, [])
        results = engine.evaluate_product_full(prod["properties"], ing_names)

        product_results: list[dict] = []
        for r in results:
            rule_id = r["rule_id"]
            status = r["status"]

            product_results.append({
                "rule_id": rule_id,
                "status": status,
                "severity": r["severity"],
                "evidence": r["evidence"],
                "reason": r["reason"],
            })

            # Aggregate by rule
            if rule_id not in by_rule_data:
                by_rule_data[rule_id] = {
                    "rule_id": rule_id,
                    "rule_name": rule_id,  # will be enriched below
                    "severity": r["severity"],
                    "triggered": 0,
                    "passed": 0,
                    "not_evaluable": 0,
                    "not_applicable": 0,
                }
            by_rule_data[rule_id][status] += 1

        by_product_list.append(
            RuleCoverageByProduct(
                product_id=pid,
                product_name=prod["name"],
                results=product_results,
            )
        )

    # Enrich by_rule with rule names from schema
    schema = _get_schema()
    rule_name_map: dict[str, str] = {}
    rule_severity_map: dict[str, str] = {}
    for _key, rd in schema.rules.items():
        rule_name_map[rd.rule_id] = rd.name
        rule_severity_map[rd.rule_id] = rd.severity

    by_rule_list: list[RuleCoverageByRule] = []
    for rule_id, data in by_rule_data.items():
        data["rule_name"] = rule_name_map.get(rule_id, rule_id)
        data["severity"] = rule_severity_map.get(rule_id, data["severity"])
        by_rule_list.append(RuleCoverageByRule(**data))

    # Aggregate summary
    total_triggered = sum(d["triggered"] for d in by_rule_data.values())
    total_passed = sum(d["passed"] for d in by_rule_data.values())
    total_not_evaluable = sum(d["not_evaluable"] for d in by_rule_data.values())
    total_not_applicable = sum(d["not_applicable"] for d in by_rule_data.values())

    summary = RuleCoverageSummary(
        total_rules=len(by_rule_data),
        total_products=len(products),
        triggered=total_triggered,
        passed=total_passed,
        not_evaluable=total_not_evaluable,
        not_applicable=total_not_applicable,
    )

    return EvaluationSummary(
        summary=summary,
        by_rule=by_rule_list,
        by_product=by_product_list,
    )


def get_product_rules(product_id: str) -> list[dict]:
    """Get all rule evaluation results for a specific product."""
    engine = _get_engine()
    driver = get_driver()

    with driver.session() as session:
        # Fetch the product node
        product_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid}) RETURN p",
            pid=product_id,
        )
        product_record = product_result.single()
        if not product_record:
            raise ValueError(f"Product '{product_id}' not found")
        product = dict(product_record["p"])

        # Fetch ingredient names
        ingredients_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[:CONTAINS]->(i:Ingredient) "
            "RETURN i.ingredient_name AS name",
            pid=product_id,
        )
        ingredient_names = [
            (r["name"] or "").lower().strip() for r in ingredients_result
        ]

        # Check which triggered rules already have TRIGGERS_RISK edges in graph
        trigger_result = session.run(
            "MATCH (p:PetFoodProduct {id: $pid})-[e:TRIGGERS_RISK]->(r:RiskRule) "
            "RETURN r.rule_id AS rule_id, e.severity AS severity, e.evidence AS evidence",
            pid=product_id,
        )
        existing_triggers: dict[str, dict] = {}
        for r in trigger_result:
            existing_triggers[r["rule_id"]] = {
                "severity": r["severity"],
                "evidence": r["evidence"],
            }

    # Evaluate all rules
    evaluations = engine.evaluate_product_full(product, ingredient_names)

    results: list[dict] = []
    for ev in evaluations:
        rule_id = ev["rule_id"]
        result_entry = {
            "rule_id": rule_id,
            "rule_key": ev["rule_key"],
            "status": ev["status"],
            "severity": ev["severity"],
            "evidence": ev["evidence"],
            "reason": ev["reason"],
            "missing_fields": ev.get("missing_fields", []),
            "missing_relations": ev.get("missing_relations", []),
            "in_graph": rule_id in existing_triggers,
        }

        # If triggered and in graph, include the graph edge properties
        if ev["status"] == "triggered" and rule_id in existing_triggers:
            result_entry["graph_edge"] = existing_triggers[rule_id]

        results.append(result_entry)

    return results


def simulate_rule(request: SimulationRequest) -> SimulationResult:
    """Simulate a single rule against custom input. Does NOT write to graph."""
    schema = _get_schema()
    engine = _get_engine()

    # Find the target rule
    target_rule: RuleDef | None = None
    rule_key: str | None = None
    for key, rule in schema.rules.items():
        if rule.rule_id == request.rule_id:
            target_rule = rule
            rule_key = key
            break

    if target_rule is None or rule_key is None:
        raise ValueError(f"Rule '{request.rule_id}' not found")

    # Evaluate using the engine against the full rule set, then extract the target rule's result
    results = engine.evaluate_product_full(
        request.properties,
        request.ingredient_names,
    )

    # Find the result for our target rule
    target_result: dict | None = None
    for r in results:
        if r["rule_id"] == request.rule_id:
            target_result = r
            break

    if target_result is None:
        raise ValueError(f"Rule '{request.rule_id}' was not evaluated by the engine")

    # Determine what input fields were relevant
    input_fields: dict[str, Any] = {}
    for field in _extract_required_fields(target_rule):
        if field in request.properties:
            input_fields[field] = request.properties[field]
    if "CONTAINS" in " ".join(_extract_required_fields(target_rule)):
        input_fields["ingredient_names"] = request.ingredient_names

    would_generate_evidence = target_result["status"] == "triggered"

    return SimulationResult(
        rule_id=request.rule_id,
        status=target_result["status"],
        severity=target_result["severity"],
        reason=target_result["reason"],
        input_fields=input_fields,
        missing_fields=target_result.get("missing_fields", []),
        would_generate_evidence=would_generate_evidence,
        generated_link_type=target_rule.output_link_type,
    )
