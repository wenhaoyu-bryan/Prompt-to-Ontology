"""
Rule Studio Models -- Pydantic schemas for the rule studio API.

Provides request/response models for rule listing, detail views,
coverage evaluation, and simulation endpoints.
"""

from typing import Any

from pydantic import BaseModel, Field


# ================================================================
# Rule Listing & Detail
# ================================================================


class RuleSummary(BaseModel):
    """Concise representation of a single rule for list views."""

    id: str  # rule_id
    name: str
    description: str
    severity: str
    target_type: str = "PetFoodProduct"
    condition_type: str
    condition_desc: str  # human-readable condition
    required_fields: list[str]
    generated_link_type: str = "TRIGGERS_RISK"


class RuleDetail(BaseModel):
    """Full rule detail with logic explanation and deterministic examples."""

    rule: RuleSummary
    logic_explanation: dict  # {plain_english, plain_chinese, required_fields, applicability, trigger_condition, pass_condition, not_evaluable_reason}
    examples: dict  # {triggered: {...}, passed: {...}, not_evaluable: {...}, not_applicable: {...}}


# ================================================================
# Evaluation Summary (coverage across all products)
# ================================================================


class RuleCoverageSummary(BaseModel):
    """Aggregate counts across all rules and products."""

    total_rules: int
    total_products: int
    triggered: int
    passed: int
    not_evaluable: int
    not_applicable: int


class RuleCoverageByRule(BaseModel):
    """Per-rule aggregation of evaluation statuses."""

    rule_id: str
    rule_name: str
    severity: str
    triggered: int
    passed: int
    not_evaluable: int
    not_applicable: int


class RuleCoverageByProduct(BaseModel):
    """Per-product aggregation of evaluation results."""

    product_id: str
    product_name: str
    results: list[dict]


class EvaluationSummary(BaseModel):
    """Full evaluation summary combining aggregate, by-rule, and by-product views."""

    summary: RuleCoverageSummary
    by_rule: list[RuleCoverageByRule]
    by_product: list[RuleCoverageByProduct]


# ================================================================
# Simulation
# ================================================================


class SimulationRequest(BaseModel):
    """Request to simulate a single rule against custom input data."""

    rule_id: str
    object_type: str = "PetFoodProduct"
    properties: dict[str, Any]
    ingredient_names: list[str] = Field(default_factory=list)


class SimulationResult(BaseModel):
    """Result of simulating a single rule against custom input."""

    rule_id: str
    status: str
    severity: str
    reason: str
    input_fields: dict[str, Any]
    missing_fields: list[str]
    would_generate_evidence: bool
    generated_link_type: str = "TRIGGERS_RISK"
